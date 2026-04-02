"""Tests for board label presets and bulk archive."""
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


def _setup(client: TestClient, user: str = "alice") -> tuple[str, str, str]:
    """Create a board with one column and two cards. Returns (board_id, col_id, card_id)."""
    resp = client.post("/api/boards", params={"user": user}, json={"title": "LB Test"})
    board_id = resp.json()["id"]
    col_id = "col-1"
    board = {
        "columns": [{"id": col_id, "title": "Todo", "wipLimit": None, "color": None, "cardIds": ["c1", "c2"]}],
        "cards": {
            "c1": {"id": "c1", "title": "A", "details": "", "priority": "none", "dueDate": None, "labels": "", "estimate": None},
            "c2": {"id": "c2", "title": "B", "details": "", "priority": "none", "dueDate": None, "labels": "", "estimate": None},
        },
    }
    client.put("/api/board", params={"user": user, "board_id": board_id}, json=board)
    return board_id, col_id, "c1"


# ---------------------------------------------------------------------------
# Label presets
# ---------------------------------------------------------------------------

def test_labels_empty_initially(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, _, _ = _setup(client)
    resp = client.get(f"/api/boards/{board_id}/labels", params={"user": "alice"})
    assert resp.status_code == 200
    assert resp.json() == []


def test_set_labels(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, _, _ = _setup(client)
    resp = client.put(
        f"/api/boards/{board_id}/labels",
        params={"user": "alice"},
        json={"labels": ["bug", "feature", "urgent"]},
    )
    assert resp.status_code == 200
    assert resp.json() == ["bug", "feature", "urgent"]


def test_get_labels_returns_set_labels(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, _, _ = _setup(client)
    client.put(f"/api/boards/{board_id}/labels", params={"user": "alice"}, json={"labels": ["x", "y"]})
    labels = client.get(f"/api/boards/{board_id}/labels", params={"user": "alice"}).json()
    assert labels == ["x", "y"]


def test_set_labels_empty_clears(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, _, _ = _setup(client)
    client.put(f"/api/boards/{board_id}/labels", params={"user": "alice"}, json={"labels": ["a", "b"]})
    client.put(f"/api/boards/{board_id}/labels", params={"user": "alice"}, json={"labels": []})
    labels = client.get(f"/api/boards/{board_id}/labels", params={"user": "alice"}).json()
    assert labels == []


def test_labels_wrong_user_denied(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, _, _ = _setup(client, "alice")
    resp = client.get(f"/api/boards/{board_id}/labels", params={"user": "bob"})
    assert resp.status_code == 404


def test_put_labels_wrong_user_denied(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, _, _ = _setup(client, "alice")
    resp = client.put(f"/api/boards/{board_id}/labels", params={"user": "bob"}, json={"labels": ["x"]})
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Bulk archive
# ---------------------------------------------------------------------------

def test_bulk_archive_all_column_cards(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, col_id, _ = _setup(client)
    resp = client.post(
        f"/api/boards/{board_id}/columns/{col_id}/archive-all",
        params={"user": "alice"},
    )
    assert resp.status_code == 200
    assert resp.json()["archived_count"] == 2


def test_bulk_archive_cards_removed_from_board(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, col_id, _ = _setup(client)
    client.post(f"/api/boards/{board_id}/columns/{col_id}/archive-all", params={"user": "alice"})
    board = client.get("/api/board", params={"user": "alice", "board_id": board_id}).json()
    assert board["columns"][0]["cardIds"] == []


def test_bulk_archive_cards_in_archive_list(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, col_id, _ = _setup(client)
    client.post(f"/api/boards/{board_id}/columns/{col_id}/archive-all", params={"user": "alice"})
    archive = client.get(f"/api/boards/{board_id}/archive", params={"user": "alice"}).json()
    assert len(archive) == 2


def test_bulk_archive_empty_column(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, _, _ = _setup(client)
    # Add an empty column
    board = client.get("/api/board", params={"user": "alice", "board_id": board_id}).json()
    board["columns"].append({"id": "col-2", "title": "Empty", "wipLimit": None, "color": None, "cardIds": []})
    client.put("/api/board", params={"user": "alice", "board_id": board_id}, json=board)
    resp = client.post(
        f"/api/boards/{board_id}/columns/col-2/archive-all",
        params={"user": "alice"},
    )
    assert resp.json()["archived_count"] == 0


def test_bulk_archive_logs_activity(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, col_id, _ = _setup(client)
    client.post(f"/api/boards/{board_id}/columns/{col_id}/archive-all", params={"user": "alice"})
    activity = client.get(f"/api/boards/{board_id}/activity", params={"user": "alice"}).json()
    actions = [a["action"] for a in activity]
    assert "bulk_archive" in actions


def test_bulk_archive_wrong_user_denied(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, col_id, _ = _setup(client, "alice")
    resp = client.post(
        f"/api/boards/{board_id}/columns/{col_id}/archive-all",
        params={"user": "bob"},
    )
    assert resp.status_code == 404
