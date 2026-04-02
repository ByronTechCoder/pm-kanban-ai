"""Tests for board stats endpoint."""
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


def _setup_board(client: TestClient, user: str = "alice") -> str:
    """Create a board with cards of different priorities. Returns board_id."""
    resp = client.post("/api/boards", params={"user": user}, json={"title": "Stats Board"})
    board_id = resp.json()["id"]
    board = {
        "columns": [
            {"id": "col-1", "title": "Todo", "wipLimit": None, "color": None, "cardIds": ["c1", "c2", "c3"]},
            {"id": "col-2", "title": "Done", "wipLimit": None, "color": None, "cardIds": ["c4"]},
        ],
        "cards": {
            "c1": {"id": "c1", "title": "A", "details": "", "priority": "high", "dueDate": "2020-01-01", "labels": "", "estimate": 3},
            "c2": {"id": "c2", "title": "B", "details": "", "priority": "medium", "dueDate": None, "labels": "", "estimate": 5},
            "c3": {"id": "c3", "title": "C", "details": "", "priority": "none", "dueDate": None, "labels": "", "estimate": None},
            "c4": {"id": "c4", "title": "D", "details": "", "priority": "high", "dueDate": "2099-01-01", "labels": "", "estimate": None},
        },
    }
    client.put("/api/board", params={"user": user, "board_id": board_id}, json=board)
    return board_id


def test_stats_total_cards(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id = _setup_board(client)
    resp = client.get(f"/api/boards/{board_id}/stats", params={"user": "alice"})
    assert resp.status_code == 200
    assert resp.json()["total_cards"] == 4


def test_stats_high_priority_count(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id = _setup_board(client)
    resp = client.get(f"/api/boards/{board_id}/stats", params={"user": "alice"})
    assert resp.json()["high_priority_cards"] == 2


def test_stats_overdue_count(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id = _setup_board(client)
    resp = client.get(f"/api/boards/{board_id}/stats", params={"user": "alice"})
    # c1 has dueDate 2020-01-01 which is past
    assert resp.json()["overdue_cards"] == 1


def test_stats_estimate_totals(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id = _setup_board(client)
    resp = client.get(f"/api/boards/{board_id}/stats", params={"user": "alice"})
    data = resp.json()
    # c1=3pts, c2=5pts, c3 and c4 have no estimate
    assert data["total_estimate"] == 8
    assert data["estimated_cards"] == 2


def test_stats_cards_per_column(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id = _setup_board(client)
    resp = client.get(f"/api/boards/{board_id}/stats", params={"user": "alice"})
    per_col = resp.json()["cards_per_column"]
    assert per_col["Todo"] == 3
    assert per_col["Done"] == 1


def test_stats_empty_board(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    resp = client.post("/api/boards", params={"user": "alice"}, json={"title": "Empty"})
    board_id = resp.json()["id"]
    resp = client.get(f"/api/boards/{board_id}/stats", params={"user": "alice"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_cards"] == 0
    assert data["overdue_cards"] == 0
    assert data["high_priority_cards"] == 0
    assert data["total_estimate"] == 0
    assert data["estimated_cards"] == 0


def test_stats_wrong_user_denied(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id = _setup_board(client, "alice")
    resp = client.get(f"/api/boards/{board_id}/stats", params={"user": "bob"})
    assert resp.status_code == 404
