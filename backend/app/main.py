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

from .db import (
    add_comment,
    authenticate_user,
    board_belongs_to_user,
    card_accessible_by_user,
    create_board,
    delete_board,
    get_comments,
    get_or_create_board,
    init_db,
    list_boards,
    load_board,
    register_user,
    rename_board,
    replace_board,
)

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


# ---------------------------------------------------------------------------
# Auth models & endpoints
# ---------------------------------------------------------------------------

class AuthRequest(BaseModel):
    username: str
    password: str


class AuthResponse(BaseModel):
    username: str
    message: str


@app.post("/api/auth/register", response_model=AuthResponse)
def api_register(payload: AuthRequest) -> AuthResponse:
    username = payload.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="username is required")
    if len(username) < 2:
        raise HTTPException(status_code=400, detail="username must be at least 2 characters")
    if not payload.password or len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="password must be at least 6 characters")
    try:
        register_user(username, payload.password)
    except Exception:
        raise HTTPException(status_code=409, detail="username already taken")
    return AuthResponse(username=username, message="registered")


@app.post("/api/auth/login", response_model=AuthResponse)
def api_login(payload: AuthRequest) -> AuthResponse:
    user_id = authenticate_user(payload.username.strip(), payload.password)
    if not user_id:
        raise HTTPException(status_code=401, detail="invalid credentials")
    return AuthResponse(username=payload.username.strip(), message="authenticated")


# ---------------------------------------------------------------------------
# Board management models & endpoints
# ---------------------------------------------------------------------------

class BoardSummary(BaseModel):
    id: str
    title: str
    created_at: str
    updated_at: str


class CreateBoardRequest(BaseModel):
    title: str


class RenameBoardRequest(BaseModel):
    title: str


def _require_user(username: str | None) -> str:
    if not username:
        raise HTTPException(status_code=400, detail="user is required")
    return username


def _require_board_access(board_id: str, username: str) -> None:
    if not board_belongs_to_user(board_id, username):
        raise HTTPException(status_code=404, detail="board not found")


@app.get("/api/boards", response_model=list[BoardSummary])
def get_boards(user: str | None = Query(default=None)) -> list[BoardSummary]:
    username = _require_user(user)
    boards = list_boards(username)
    return [BoardSummary(**b) for b in boards]


@app.post("/api/boards", response_model=BoardSummary, status_code=201)
def post_boards(
    payload: CreateBoardRequest,
    user: str | None = Query(default=None),
) -> BoardSummary:
    username = _require_user(user)
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    board_id = create_board(username, title)
    boards = list_boards(username)
    board = next(b for b in boards if b["id"] == board_id)
    return BoardSummary(**board)


@app.patch("/api/boards/{board_id}", response_model=BoardSummary)
def patch_board(
    board_id: str,
    payload: RenameBoardRequest,
    user: str | None = Query(default=None),
) -> BoardSummary:
    username = _require_user(user)
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    if not rename_board(board_id, username, title):
        raise HTTPException(status_code=404, detail="board not found")
    boards = list_boards(username)
    board = next(b for b in boards if b["id"] == board_id)
    return BoardSummary(**board)


@app.delete("/api/boards/{board_id}", status_code=204)
def del_board(
    board_id: str,
    user: str | None = Query(default=None),
) -> None:
    username = _require_user(user)
    if not delete_board(board_id, username):
        raise HTTPException(status_code=404, detail="board not found")


# ---------------------------------------------------------------------------
# Comment models & endpoints
# ---------------------------------------------------------------------------

class Comment(BaseModel):
    id: str
    card_id: str
    author: str
    text: str
    created_at: str


class AddCommentRequest(BaseModel):
    text: str


@app.get("/api/cards/{card_id}/comments", response_model=list[Comment])
def get_card_comments(
    card_id: str,
    user: str | None = Query(default=None),
) -> list[Comment]:
    username = _require_user(user)
    if not card_accessible_by_user(card_id, username):
        raise HTTPException(status_code=404, detail="card not found")
    return [Comment(**c) for c in get_comments(card_id)]


@app.post("/api/cards/{card_id}/comments", response_model=Comment, status_code=201)
def post_card_comment(
    card_id: str,
    payload: AddCommentRequest,
    user: str | None = Query(default=None),
) -> Comment:
    username = _require_user(user)
    if not card_accessible_by_user(card_id, username):
        raise HTTPException(status_code=404, detail="card not found")
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    return Comment(**add_comment(card_id, username, text))


# ---------------------------------------------------------------------------
# Board data models & endpoints
# ---------------------------------------------------------------------------

class Card(BaseModel):
    id: str
    title: str
    details: str
    priority: str = "none"
    dueDate: str | None = None
    labels: str = ""


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
def get_board(
    user: str | None = Query(default=None),
    board_id: str | None = Query(default=None),
) -> BoardData:
    username = _require_user(user)
    if board_id:
        _require_board_access(board_id, username)
        bid = board_id
    else:
        bid = get_or_create_board(username)
    return BoardData(**load_board(bid))


@app.put("/api/board", response_model=BoardData)
def put_board(
    payload: BoardData,
    user: str | None = Query(default=None),
    board_id: str | None = Query(default=None),
) -> BoardData:
    username = _require_user(user)
    _validate_board_integrity(payload)
    if board_id:
        _require_board_access(board_id, username)
        bid = board_id
    else:
        bid = get_or_create_board(username)
    replace_board(bid, payload.model_dump())
    return BoardData(**load_board(bid))


# ---------------------------------------------------------------------------
# Chat endpoint
# ---------------------------------------------------------------------------

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
        '"cards": {"card1": {"id": "card1", "title": "Task", "details": "", "priority": "none", "dueDate": null, "labels": ""}}}\n'
        "\n"
        "Card priority values: none, low, medium, high\n"
        "Card dueDate format: YYYY-MM-DD or null\n"
        "Card labels: comma-separated string\n"
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
def api_chat(
    payload: ChatRequest,
    user: str | None = Query(default=None),
    board_id: str | None = Query(default=None),
) -> ChatResponse:
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY is not set")

    username = _require_user(user)
    if board_id:
        _require_board_access(board_id, username)
        bid = board_id
    else:
        bid = get_or_create_board(username)
    current_board = BoardData(**load_board(bid))

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
        replace_board(bid, structured_response.boardUpdates.model_dump())

    board_updates_applied = structured_response.boardUpdates is not None
    latest_board = BoardData(**load_board(bid))

    return ChatResponse(
        reply=structured_response.responseText,
        boardUpdatesApplied=board_updates_applied,
        board=latest_board,
    )


static_dir = Path(__file__).resolve().parents[2] / "frontend" / "out"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
