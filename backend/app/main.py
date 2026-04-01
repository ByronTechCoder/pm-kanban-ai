from contextlib import asynccontextmanager
from pathlib import Path
import os
import json
from typing import Literal

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ValidationError, model_validator
from fastapi.staticfiles import StaticFiles
import requests
from dotenv import load_dotenv

from .db import get_or_create_board, init_db, load_board, replace_board

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

OPENROUTER_MODEL = "openai/gpt-oss-120b"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(lifespan=lifespan)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


@app.get("/api/hello")
def api_hello() -> dict[str, str]:
    return {"message": "Hello from FastAPI"}


class Card(BaseModel):
    id: str
    title: str
    details: str


class Column(BaseModel):
    id: str
    title: str
    cardIds: list[str]


class BoardData(BaseModel):
    columns: list[Column]
    cards: dict[str, Card]


class ChatHistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    prompt: str | None = None
    message: str | None = None
    history: list[ChatHistoryMessage] = []

    @model_validator(mode="after")
    def validate_prompt(self) -> "ChatRequest":
        if self.prompt and self.prompt.strip():
            return self
        if self.message and self.message.strip():
            self.prompt = self.message
            return self
        raise ValueError("prompt is required")


class ChatResponse(BaseModel):
    reply: str
    boardUpdatesApplied: bool
    board: BoardData


class StructuredAssistantResponse(BaseModel):
    responseText: str
    boardUpdates: BoardData | None = None


def _require_user(username: str | None) -> str:
    if not username:
        raise HTTPException(status_code=400, detail="user is required")
    return username


def _validate_board_integrity(board: BoardData) -> None:
    card_ids = set(board.cards.keys())
    for col in board.columns:
        missing = set(col.cardIds) - card_ids
        if missing:
            raise HTTPException(
                status_code=422,
                detail=f"Column '{col.title}' references unknown card IDs: {sorted(missing)}",
            )


@app.get("/api/board", response_model=BoardData)
def get_board(user: str | None = Query(default=None)) -> BoardData:
    username = _require_user(user)
    board_id = get_or_create_board(username)
    return BoardData(**load_board(board_id))


@app.put("/api/board", response_model=BoardData)
def put_board(payload: BoardData, user: str | None = Query(default=None)) -> BoardData:
    username = _require_user(user)
    _validate_board_integrity(payload)
    board_id = get_or_create_board(username)
    replace_board(board_id, payload.model_dump())
    return BoardData(**load_board(board_id))


def _extract_assistant_text(data: dict) -> str:
    choices = data.get("choices", [])
    if not choices:
        return ""

    message = choices[0].get("message", {})
    content = message.get("content", "")

    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                text_value = item.get("text")
                if isinstance(text_value, str):
                    parts.append(text_value)
        return "\n".join(parts).strip()

    return ""


def _build_chat_messages(
    board: BoardData,
    prompt: str,
    history: list[ChatHistoryMessage],
) -> list[dict[str, str]]:
    system_prompt = (
        "You are a project management assistant helping the user manage their Kanban board.\n"
        "Always respond with a JSON object containing exactly two fields:\n"
        '- "responseText": your reply to the user as a plain string\n'
        '- "boardUpdates": null if no board changes are needed, or a full updated board object\n'
        "\n"
        "The board object format is:\n"
        '{"columns": [{"id": "col1", "title": "To Do", "cardIds": ["card1"]}], '
        '"cards": {"card1": {"id": "card1", "title": "Task", "details": ""}}}\n'
        "\n"
        "When returning boardUpdates, include ALL columns and ALL cards (not just changed ones).\n"
        "If no board changes are needed, set boardUpdates to null."
    )
    messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
    for item in history:
        messages.append({"role": item.role, "content": item.content})

    board_json = json.dumps(board.model_dump())
    messages.append({
        "role": "user",
        "content": f"Current board state:\n{board_json}\n\nUser request: {prompt}",
    })
    return messages


def _strip_code_fences(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        inner = lines[1:]
        if inner and inner[-1].strip() == "```":
            inner = inner[:-1]
        return "\n".join(inner).strip()
    return stripped


def _parse_structured_assistant_response(raw_text: str) -> StructuredAssistantResponse:
    text = _strip_code_fences(raw_text)
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid structured output JSON: {exc}") from exc

    try:
        return StructuredAssistantResponse.model_validate(payload)
    except ValidationError as exc:
        raise ValueError(f"structured output schema validation failed: {exc}") from exc


@app.post("/api/chat", response_model=ChatResponse)
def api_chat(payload: ChatRequest, user: str | None = Query(default=None)) -> ChatResponse:
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY is not set")

    username = _require_user(user)
    board_id = get_or_create_board(username)
    current_board = BoardData(**load_board(board_id))

    messages = _build_chat_messages(
        board=current_board,
        prompt=payload.prompt or "",
        history=payload.history,
    )

    request_payload = {
        "model": OPENROUTER_MODEL,
        "messages": messages,
        "response_format": {"type": "json_object"},
    }

    try:
        response = requests.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=request_payload,
            timeout=60,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"OpenRouter request failed: {exc}")

    if response.status_code >= 400:
        error_text = response.text.strip()[:500]
        raise HTTPException(status_code=502, detail=f"OpenRouter error: {error_text}")

    try:
        response_data = response.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="OpenRouter returned invalid JSON")

    reply = _extract_assistant_text(response_data)
    if not reply:
        raise HTTPException(status_code=502, detail="OpenRouter returned an empty response")

    try:
        structured_response = _parse_structured_assistant_response(reply)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=f"OpenRouter returned invalid structured output: {exc}")

    if structured_response.boardUpdates is not None:
        _validate_board_integrity(structured_response.boardUpdates)
        replace_board(board_id, structured_response.boardUpdates.model_dump())

    board_updates_applied = structured_response.boardUpdates is not None
    latest_board = BoardData(**load_board(board_id))

    return ChatResponse(
        reply=structured_response.responseText,
        boardUpdatesApplied=board_updates_applied,
        board=latest_board,
    )


static_dir = Path(__file__).resolve().parents[2] / "frontend" / "out"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
