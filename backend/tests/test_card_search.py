"""Tests for card search endpoint."""
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
    resp = client.post("/api/boards", params={"user": user}, json={"title": "Search Test"})
    board_id = resp.json()["id"]
    board = {
        "columns": [
            {"id": "col-1", "title": "Todo", "wipLimit": None, "color": None, "cardIds": ["c1", "c2", "c3"]},
            {"id": "col-2", "title": "Done", "wipLimit": None, "color": None, "cardIds": ["c4"]},
        ],
        "cards": {
            "c1": {"id": "c1", "title": "Fix login bug", "details": "auth issue", "priority": "high", "dueDate": "2020-01-01", "labels": "bug,urgent", "estimate": 2},
            "c2": {"id": "c2", "title": "Build dashboard", "details": "analytics page", "priority": "medium", "dueDate": None, "labels": "feature", "estimate": 5},
            "c3": {"id": "c3", "title": "Write docs", "details": "documentation update", "priority": "low", "dueDate": None, "labels": "", "estimate": None},
            "c4": {"id": "c4", "title": "Deploy v2", "details": "prod deployment", "priority": "high", "dueDate": "2099-01-01", "labels": "ops", "estimate": 1},
        },
    }
    client.put("/api/board", params={"user": user, "board_id": board_id}, json=board)
    return board_id


def test_search_all_cards(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id = _setup_board(client)
    resp = client.get(f"/api/boards/{board_id}/search", params={"user": "alice"})
    assert resp.status_code == 200
    assert len(resp.json()) == 4


def test_search_by_query(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id = _setup_board(client)
    resp = client.get(f"/api/boards/{board_id}/search", params={"user": "alice", "q": "login"})
    results = resp.json()
    assert len(results) == 1
    assert results[0]["title"] == "Fix login bug"


def test_search_by_query_matches_details(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id = _setup_board(client)
    resp = client.get(f"/api/boards/{board_id}/search", params={"user": "alice", "q": "analytics"})
    results = resp.json()
    assert len(results) == 1
    assert results[0]["title"] == "Build dashboard"


def test_search_by_priority(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id = _setup_board(client)
    resp = client.get(f"/api/boards/{board_id}/search", params={"user": "alice", "priority": "high"})
    results = resp.json()
    assert len(results) == 2
    titles = {r["title"] for r in results}
    assert "Fix login bug" in titles
    assert "Deploy v2" in titles


def test_search_by_label(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id = _setup_board(client)
    resp = client.get(f"/api/boards/{board_id}/search", params={"user": "alice", "label": "bug"})
    results = resp.json()
    assert len(results) == 1
    assert results[0]["title"] == "Fix login bug"


def test_search_overdue_only(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id = _setup_board(client)
    resp = client.get(f"/api/boards/{board_id}/search", params={"user": "alice", "overdue": "true"})
    results = resp.json()
    assert len(results) == 1
    assert results[0]["title"] == "Fix login bug"


def test_search_result_includes_column_info(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id = _setup_board(client)
    resp = client.get(f"/api/boards/{board_id}/search", params={"user": "alice", "q": "login"})
    result = resp.json()[0]
    assert result["columnId"] == "col-1"
    assert result["columnTitle"] == "Todo"


def test_search_limit(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id = _setup_board(client)
    resp = client.get(f"/api/boards/{board_id}/search", params={"user": "alice", "limit": 2})
    assert len(resp.json()) <= 2


def test_search_no_results(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id = _setup_board(client)
    resp = client.get(f"/api/boards/{board_id}/search", params={"user": "alice", "q": "xyznotfound"})
    assert resp.json() == []


def test_search_wrong_user_denied(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id = _setup_board(client, "alice")
    resp = client.get(f"/api/boards/{board_id}/search", params={"user": "bob"})
    assert resp.status_code == 404
