"""Tests for board stats, export, and search endpoints."""
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


def _create_board_with_cards(client: TestClient, user: str = "alice") -> str:
    """Create a named board with known cards; return board_id."""
    resp = client.post("/api/boards", params={"user": user}, json={"title": "Test Board"})
    board_id = resp.json()["id"]
    board = {
        "columns": [
            {"id": "col-todo", "title": "Todo", "cardIds": ["card-1", "card-2"]},
            {"id": "col-done", "title": "Done", "cardIds": ["card-3"]},
        ],
        "cards": {
            "card-1": {
                "id": "card-1", "title": "Fix login bug", "details": "Auth issue",
                "priority": "high", "dueDate": "2020-01-01", "labels": "bug",
            },
            "card-2": {
                "id": "card-2", "title": "Write tests", "details": "Need coverage",
                "priority": "medium", "dueDate": None, "labels": "testing,backend",
            },
            "card-3": {
                "id": "card-3", "title": "Deploy release", "details": "Ship it",
                "priority": "none", "dueDate": None, "labels": "",
            },
        },
    }
    client.put("/api/board", params={"user": user, "board_id": board_id}, json=board)
    return board_id


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

def test_board_stats_total(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id = _create_board_with_cards(client)
    resp = client.get(f"/api/boards/{board_id}/stats", params={"user": "alice"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_cards"] == 3
    assert data["board_id"] == board_id


def test_board_stats_per_column(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id = _create_board_with_cards(client)
    data = client.get(f"/api/boards/{board_id}/stats", params={"user": "alice"}).json()
    assert data["cards_per_column"]["Todo"] == 2
    assert data["cards_per_column"]["Done"] == 1


def test_board_stats_overdue(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id = _create_board_with_cards(client)
    data = client.get(f"/api/boards/{board_id}/stats", params={"user": "alice"}).json()
    # card-1 has dueDate 2020-01-01 which is past
    assert data["overdue_cards"] == 1


def test_board_stats_high_priority(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id = _create_board_with_cards(client)
    data = client.get(f"/api/boards/{board_id}/stats", params={"user": "alice"}).json()
    assert data["high_priority_cards"] == 1


def test_board_stats_wrong_user_denied(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id = _create_board_with_cards(client, "alice")
    resp = client.get(f"/api/boards/{board_id}/stats", params={"user": "bob"})
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

def test_export_board(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id = _create_board_with_cards(client)
    resp = client.get(f"/api/boards/{board_id}/export", params={"user": "alice"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["board_id"] == board_id
    assert data["title"] == "Test Board"
    assert "exported_at" in data
    assert "data" in data
    assert len(data["data"]["cards"]) == 3


def test_export_board_wrong_user_denied(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id = _create_board_with_cards(client, "alice")
    resp = client.get(f"/api/boards/{board_id}/export", params={"user": "bob"})
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

def test_search_finds_card_by_title(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id = _create_board_with_cards(client)
    resp = client.get("/api/board/search", params={"user": "alice", "board_id": board_id, "q": "login"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 1
    assert data["results"][0]["title"] == "Fix login bug"


def test_search_finds_by_label(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id = _create_board_with_cards(client)
    resp = client.get("/api/board/search", params={"user": "alice", "board_id": board_id, "q": "testing"})
    assert resp.status_code == 200
    assert resp.json()["count"] == 1


def test_search_empty_query_rejected(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id = _create_board_with_cards(client)
    resp = client.get("/api/board/search", params={"user": "alice", "board_id": board_id, "q": ""})
    assert resp.status_code == 400


def test_search_wrong_user_denied(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id = _create_board_with_cards(client, "alice")
    resp = client.get("/api/board/search", params={"user": "bob", "board_id": board_id, "q": "test"})
    assert resp.status_code == 404


def test_search_no_results(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id = _create_board_with_cards(client)
    resp = client.get("/api/board/search", params={"user": "alice", "board_id": board_id, "q": "xyznotfound"})
    assert resp.status_code == 200
    assert resp.json()["count"] == 0


def test_search_requires_user(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    resp = client.get("/api/board/search", params={"q": "test"})
    assert resp.status_code == 400
