"""Tests for board import and column color."""
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


def _make_board(client: TestClient, user: str = "alice") -> tuple[str, dict]:
    resp = client.post("/api/boards", params={"user": user}, json={"title": "Import Test"})
    board_id = resp.json()["id"]
    board = {
        "columns": [
            {"id": "col-1", "title": "Todo", "wipLimit": None, "color": "#3b82f6", "cardIds": ["c1"]},
            {"id": "col-2", "title": "Done", "wipLimit": None, "color": None, "cardIds": []},
        ],
        "cards": {
            "c1": {"id": "c1", "title": "Task A", "details": "", "priority": "none", "dueDate": None, "labels": ""},
        },
    }
    client.put("/api/board", params={"user": user, "board_id": board_id}, json=board)
    return board_id, board


# ---------------------------------------------------------------------------
# Column color
# ---------------------------------------------------------------------------

def test_column_color_stored(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, _ = _make_board(client)
    resp = client.get("/api/board", params={"user": "alice", "board_id": board_id})
    cols = resp.json()["columns"]
    assert cols[0]["color"] == "#3b82f6"
    assert cols[1]["color"] is None


def test_column_color_updated(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, board = _make_board(client)
    board["columns"][0]["color"] = "#ef4444"
    client.put("/api/board", params={"user": "alice", "board_id": board_id}, json=board)
    cols = client.get("/api/board", params={"user": "alice", "board_id": board_id}).json()["columns"]
    assert cols[0]["color"] == "#ef4444"


def test_column_color_cleared(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, board = _make_board(client)
    board["columns"][0]["color"] = None
    client.put("/api/board", params={"user": "alice", "board_id": board_id}, json=board)
    cols = client.get("/api/board", params={"user": "alice", "board_id": board_id}).json()["columns"]
    assert cols[0]["color"] is None


# ---------------------------------------------------------------------------
# Board import
# ---------------------------------------------------------------------------

def test_import_replaces_board(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, _ = _make_board(client)
    new_data = {
        "columns": [
            {"id": "new-col", "title": "New Column", "wipLimit": None, "color": None, "cardIds": ["new-c1"]},
        ],
        "cards": {
            "new-c1": {"id": "new-c1", "title": "Imported Card", "details": "from import",
                       "priority": "high", "dueDate": None, "labels": ""},
        },
    }
    resp = client.post(f"/api/boards/{board_id}/import", params={"user": "alice"}, json=new_data)
    assert resp.status_code == 200
    board = resp.json()
    assert len(board["columns"]) == 1
    assert board["columns"][0]["title"] == "New Column"
    assert "new-c1" in board["cards"]


def test_import_with_export_envelope(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, _ = _make_board(client)
    # Export the board
    export = client.get(f"/api/boards/{board_id}/export", params={"user": "alice"}).json()
    # Clear board, then import from export envelope
    export["data"]["columns"][0]["title"] = "Restored"
    resp = client.post(f"/api/boards/{board_id}/import", params={"user": "alice"}, json=export)
    assert resp.status_code == 200
    board = resp.json()
    assert board["columns"][0]["title"] == "Restored"


def test_import_wrong_user_denied(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, _ = _make_board(client, "alice")
    resp = client.post(f"/api/boards/{board_id}/import", params={"user": "bob"}, json={})
    assert resp.status_code == 404


def test_import_invalid_data_rejected(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, _ = _make_board(client)
    # Pass completely invalid board structure
    resp = client.post(f"/api/boards/{board_id}/import", params={"user": "alice"}, json={"bad": "data"})
    assert resp.status_code == 422


def test_import_logs_activity(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, board = _make_board(client)
    client.post(f"/api/boards/{board_id}/import", params={"user": "alice"}, json=board)
    activity = client.get(f"/api/boards/{board_id}/activity", params={"user": "alice"}).json()
    actions = [a["action"] for a in activity]
    assert "import" in actions
