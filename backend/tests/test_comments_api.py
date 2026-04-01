"""Tests for card comments API."""
import importlib
import os
from pathlib import Path

from fastapi.testclient import TestClient


def _get_client(tmp_path: Path) -> TestClient:
    os.environ["KANBAN_DB_PATH"] = str(tmp_path / "test.db")
    import app.db as db_module
    import app.main as main_module

    importlib.reload(db_module)
    importlib.reload(main_module)
    db_module.init_db()

    return TestClient(main_module.app)


def _get_card_id(client: TestClient, user: str = "alice") -> str:
    """Get the first card ID from the user's default board."""
    board = client.get("/api/board", params={"user": user}).json()
    return list(board["cards"].keys())[0]


def test_list_comments_empty(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    card_id = _get_card_id(client)
    response = client.get(f"/api/cards/{card_id}/comments", params={"user": "alice"})
    assert response.status_code == 200
    assert response.json() == []


def test_post_comment(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    card_id = _get_card_id(client)
    response = client.post(
        f"/api/cards/{card_id}/comments",
        params={"user": "alice"},
        json={"text": "Looks good to me!"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["text"] == "Looks good to me!"
    assert data["author"] == "alice"
    assert data["card_id"] == card_id
    assert "id" in data
    assert "created_at" in data


def test_list_comments_after_post(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    card_id = _get_card_id(client)
    client.post(f"/api/cards/{card_id}/comments", params={"user": "alice"}, json={"text": "First comment"})
    client.post(f"/api/cards/{card_id}/comments", params={"user": "alice"}, json={"text": "Second comment"})

    response = client.get(f"/api/cards/{card_id}/comments", params={"user": "alice"})
    assert response.status_code == 200
    comments = response.json()
    assert len(comments) == 2
    assert comments[0]["text"] == "First comment"
    assert comments[1]["text"] == "Second comment"


def test_comment_requires_user(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    card_id = _get_card_id(client)
    assert client.get(f"/api/cards/{card_id}/comments").status_code == 400
    assert client.post(f"/api/cards/{card_id}/comments", json={"text": "Hi"}).status_code == 400


def test_comment_empty_text_rejected(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    card_id = _get_card_id(client)
    response = client.post(
        f"/api/cards/{card_id}/comments",
        params={"user": "alice"},
        json={"text": "   "},
    )
    assert response.status_code == 400


def test_comment_wrong_user_denied(tmp_path: Path) -> None:
    """Bob cannot comment on Alice's card."""
    client = _get_client(tmp_path)
    alice_card_id = _get_card_id(client, "alice")
    response = client.post(
        f"/api/cards/{alice_card_id}/comments",
        params={"user": "bob"},
        json={"text": "Should not work"},
    )
    assert response.status_code == 404


def test_comment_nonexistent_card(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    response = client.get(
        "/api/cards/nonexistent-card/comments",
        params={"user": "alice"},
    )
    assert response.status_code == 404


def test_comments_deleted_with_card(tmp_path: Path) -> None:
    """Comments cascade-delete when card is removed via board replace."""
    client = _get_client(tmp_path)
    board = client.get("/api/board", params={"user": "alice"}).json()
    card_id = list(board["cards"].keys())[0]

    # Post a comment
    client.post(
        f"/api/cards/{card_id}/comments",
        params={"user": "alice"},
        json={"text": "Will be deleted"},
    )

    # Remove the card from the board
    col_id = next(
        col["id"] for col in board["columns"] if card_id in col["cardIds"]
    )
    board["columns"] = [
        {**col, "cardIds": [cid for cid in col["cardIds"] if cid != card_id]}
        if col["id"] == col_id else col
        for col in board["columns"]
    ]
    del board["cards"][card_id]
    client.put("/api/board", params={"user": "alice"}, json=board)

    # Comment endpoint should now return 404 (card gone)
    resp = client.get(f"/api/cards/{card_id}/comments", params={"user": "alice"})
    assert resp.status_code == 404
