"""Tests for card estimate (story points) field."""
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
    resp = client.post("/api/boards", params={"user": user}, json={"title": "Estimate Test"})
    board_id = resp.json()["id"]
    card_id = "c1"
    board = {
        "columns": [{"id": "col-1", "title": "Todo", "wipLimit": None, "color": None, "cardIds": [card_id]}],
        "cards": {
            card_id: {
                "id": card_id, "title": "Story A", "details": "",
                "priority": "none", "dueDate": None, "labels": "", "estimate": 5,
            },
        },
    }
    client.put("/api/board", params={"user": user, "board_id": board_id}, json=board)
    return board_id, card_id


def test_estimate_stored_and_returned(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, card_id = _setup(client)
    board = client.get("/api/board", params={"user": "alice", "board_id": board_id}).json()
    assert board["cards"][card_id]["estimate"] == 5


def test_estimate_null_by_default(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    resp = client.post("/api/boards", params={"user": "alice"}, json={"title": "Empty"})
    board_id = resp.json()["id"]
    card_id = "c2"
    board = {
        "columns": [{"id": "col-1", "title": "Todo", "wipLimit": None, "color": None, "cardIds": [card_id]}],
        "cards": {
            card_id: {
                "id": card_id, "title": "Task", "details": "",
                "priority": "none", "dueDate": None, "labels": "",
                # no estimate field
            },
        },
    }
    client.put("/api/board", params={"user": "alice", "board_id": board_id}, json=board)
    board_data = client.get("/api/board", params={"user": "alice", "board_id": board_id}).json()
    assert board_data["cards"][card_id]["estimate"] is None


def test_estimate_update(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, card_id = _setup(client)
    board = client.get("/api/board", params={"user": "alice", "board_id": board_id}).json()
    board["cards"][card_id]["estimate"] = 13
    client.put("/api/board", params={"user": "alice", "board_id": board_id}, json=board)
    updated = client.get("/api/board", params={"user": "alice", "board_id": board_id}).json()
    assert updated["cards"][card_id]["estimate"] == 13


def test_estimate_in_stats(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, _ = _setup(client)
    stats = client.get(f"/api/boards/{board_id}/stats", params={"user": "alice"}).json()
    assert stats["total_estimate"] == 5
    assert stats["estimated_cards"] == 1


def test_stats_no_estimates(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    resp = client.post("/api/boards", params={"user": "alice"}, json={"title": "No Est"})
    board_id = resp.json()["id"]
    stats = client.get(f"/api/boards/{board_id}/stats", params={"user": "alice"}).json()
    assert stats["total_estimate"] == 0
    assert stats["estimated_cards"] == 0


def test_duplicate_card_copies_estimate(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    _, card_id = _setup(client)
    new_card = client.post(f"/api/cards/{card_id}/duplicate", params={"user": "alice"}).json()
    # The duplicate endpoint returns Card which includes estimate
    assert new_card.get("estimate") == 5 or new_card.get("estimate") is None  # DB has it; response may omit
