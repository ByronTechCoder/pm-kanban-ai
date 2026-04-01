"""Tests for card archiving and board activity log."""
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


def _setup(client: TestClient, user: str = "alice") -> tuple[str, str]:
    """Create a board with one card. Returns (board_id, card_id)."""
    resp = client.post("/api/boards", params={"user": user}, json={"title": "Archive Test"})
    board_id = resp.json()["id"]
    card_id = "card-arch-1"
    board = {
        "columns": [{"id": "col-1", "title": "Todo", "wipLimit": None, "cardIds": [card_id]}],
        "cards": {
            card_id: {
                "id": card_id, "title": "Task", "details": "",
                "priority": "none", "dueDate": None, "labels": "",
            },
        },
    }
    client.put("/api/board", params={"user": user, "board_id": board_id}, json=board)
    return board_id, card_id


# ---------------------------------------------------------------------------
# Archive
# ---------------------------------------------------------------------------

def test_archive_card_removes_from_board(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, card_id = _setup(client)
    resp = client.post(f"/api/cards/{card_id}/archive", params={"user": "alice"})
    assert resp.status_code == 204
    board = client.get("/api/board", params={"user": "alice", "board_id": board_id}).json()
    assert card_id not in board["cards"]


def test_archived_card_appears_in_archive(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, card_id = _setup(client)
    client.post(f"/api/cards/{card_id}/archive", params={"user": "alice"})
    resp = client.get(f"/api/boards/{board_id}/archive", params={"user": "alice"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["id"] == card_id
    assert data[0]["title"] == "Task"
    assert "columnTitle" in data[0]


def test_archive_wrong_user_denied(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    _, card_id = _setup(client, "alice")
    resp = client.post(f"/api/cards/{card_id}/archive", params={"user": "bob"})
    assert resp.status_code == 404


def test_archive_nonexistent_card(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    resp = client.post("/api/cards/nonexistent/archive", params={"user": "alice"})
    assert resp.status_code == 404


def test_restore_card_appears_in_board(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, card_id = _setup(client)
    client.post(f"/api/cards/{card_id}/archive", params={"user": "alice"})
    resp = client.post(f"/api/cards/{card_id}/restore", params={"user": "alice"})
    assert resp.status_code == 200
    assert resp.json()["id"] == card_id
    # Card should now appear in board again
    board = client.get("/api/board", params={"user": "alice", "board_id": board_id}).json()
    assert card_id in board["cards"]


def test_restore_removes_from_archive(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, card_id = _setup(client)
    client.post(f"/api/cards/{card_id}/archive", params={"user": "alice"})
    client.post(f"/api/cards/{card_id}/restore", params={"user": "alice"})
    archive = client.get(f"/api/boards/{board_id}/archive", params={"user": "alice"}).json()
    assert len(archive) == 0


def test_archive_list_wrong_user_denied(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, _ = _setup(client, "alice")
    resp = client.get(f"/api/boards/{board_id}/archive", params={"user": "bob"})
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Activity log
# ---------------------------------------------------------------------------

def test_activity_empty_initially(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, _ = _setup(client)
    resp = client.get(f"/api/boards/{board_id}/activity", params={"user": "alice"})
    # The PUT /api/board call during setup logs one activity
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_activity_logged_on_board_update(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, _ = _setup(client)
    activity = client.get(f"/api/boards/{board_id}/activity", params={"user": "alice"}).json()
    actions = [a["action"] for a in activity]
    assert "update" in actions


def test_post_activity(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, _ = _setup(client)
    resp = client.post(
        f"/api/boards/{board_id}/activity",
        params={"user": "alice"},
        json={"action": "comment", "entity_type": "card", "description": "Added a comment"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["action"] == "comment"
    assert data["description"] == "Added a comment"
    assert data["username"] == "alice"


def test_post_activity_missing_fields(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, _ = _setup(client)
    resp = client.post(
        f"/api/boards/{board_id}/activity",
        params={"user": "alice"},
        json={"action": "comment"},
    )
    assert resp.status_code == 400


def test_activity_limit_param(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, _ = _setup(client)
    # Add 5 entries
    for i in range(5):
        client.post(
            f"/api/boards/{board_id}/activity",
            params={"user": "alice"},
            json={"action": "note", "entity_type": "board", "description": f"Entry {i}"},
        )
    all_entries = client.get(f"/api/boards/{board_id}/activity", params={"user": "alice"}).json()
    limited = client.get(f"/api/boards/{board_id}/activity", params={"user": "alice", "limit": 2}).json()
    assert len(limited) == 2
    assert len(all_entries) > 2


def test_activity_wrong_user_denied(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, _ = _setup(client, "alice")
    resp = client.get(f"/api/boards/{board_id}/activity", params={"user": "bob"})
    assert resp.status_code == 404


def test_archive_logs_activity(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, card_id = _setup(client)
    client.post(f"/api/cards/{card_id}/archive", params={"user": "alice", "board_id": board_id})
    activity = client.get(f"/api/boards/{board_id}/activity", params={"user": "alice"}).json()
    actions = [a["action"] for a in activity]
    assert "archive" in actions
