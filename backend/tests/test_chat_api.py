import importlib
import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient



def _get_client(tmp_path: Path) -> tuple[TestClient, object]:
    os.environ["KANBAN_DB_PATH"] = str(tmp_path / "test.db")
    import app.db as db_module
    import app.main as main_module

    importlib.reload(db_module)
    importlib.reload(main_module)
    db_module.init_db()

    return TestClient(main_module.app), main_module



def test_chat_live_connectivity_2_plus_2(tmp_path: Path) -> None:
    if not os.getenv("OPENROUTER_API_KEY"):
        pytest.skip("OPENROUTER_API_KEY is not set; skipping live OpenRouter connectivity test")

    client, _ = _get_client(tmp_path)
    response = client.post(
        "/api/chat",
        params={"user": "user"},
        json={
            "prompt": "What is 2+2? Do not change the board.",
            "history": [],
        },
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert isinstance(payload.get("reply"), str)
    assert "4" in payload["reply"]


def test_chat_applies_board_updates(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    client, main_module = _get_client(tmp_path)

    current_board = client.get("/api/board", params={"user": "user"}).json()
    current_board["columns"][0]["title"] = "AI Updated"

    structured_output = {
        "responseText": "Updated the first column title.",
        "boardUpdates": current_board,
    }

    class FakeResponse:
        status_code = 200
        text = "ok"

        def json(self) -> dict:
            return {
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(structured_output),
                        }
                    }
                ]
            }

    def fake_post(*args, **kwargs) -> FakeResponse:  # type: ignore[no-untyped-def]
        return FakeResponse()

    monkeypatch.setattr(main_module.requests, "post", fake_post)

    response = client.post(
        "/api/chat",
        params={"user": "user"},
        json={"prompt": "Rename first column", "history": []},
    )
    assert response.status_code == 200, response.text

    payload = response.json()
    assert payload["boardUpdatesApplied"] is True
    assert payload["board"]["columns"][0]["title"] == "AI Updated"

    board_response = client.get("/api/board", params={"user": "user"})
    assert board_response.status_code == 200
    assert board_response.json()["columns"][0]["title"] == "AI Updated"


def test_chat_rejects_invalid_structured_output(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    client, main_module = _get_client(tmp_path)

    class FakeResponse:
        status_code = 200
        text = "ok"

        def json(self) -> dict:
            return {
                "choices": [
                    {
                        "message": {
                            "content": "not valid json",
                        }
                    }
                ]
            }

    def fake_post(*args, **kwargs) -> FakeResponse:  # type: ignore[no-untyped-def]
        return FakeResponse()

    monkeypatch.setattr(main_module.requests, "post", fake_post)

    response = client.post(
        "/api/chat",
        params={"user": "user"},
        json={"prompt": "Do something", "history": []},
    )

    assert response.status_code == 502
    assert "invalid structured output" in response.json()["error"].lower()
