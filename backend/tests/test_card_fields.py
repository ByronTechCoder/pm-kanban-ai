"""Tests for enhanced card fields: priority, dueDate, labels."""
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


def _board_with_card(
    priority: str = "none",
    due_date: str | None = None,
    labels: str = "",
) -> dict:
    return {
        "columns": [{"id": "col-1", "title": "Todo", "cardIds": ["card-1"]}],
        "cards": {
            "card-1": {
                "id": "card-1",
                "title": "Task",
                "details": "Some details",
                "priority": priority,
                "dueDate": due_date,
                "labels": labels,
            }
        },
    }


def test_card_default_fields_present(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board = client.get("/api/board", params={"user": "user"}).json()
    # Default seeded board should have cards with new fields
    card = next(iter(board["cards"].values()))
    assert "priority" in card
    assert "dueDate" in card
    assert "labels" in card


def test_save_and_load_priority(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board = _board_with_card(priority="high")
    put_resp = client.put("/api/board", params={"user": "user"}, json=board)
    assert put_resp.status_code == 200
    assert put_resp.json()["cards"]["card-1"]["priority"] == "high"

    get_resp = client.get("/api/board", params={"user": "user"})
    assert get_resp.json()["cards"]["card-1"]["priority"] == "high"


def test_save_and_load_due_date(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board = _board_with_card(due_date="2026-06-15")
    client.put("/api/board", params={"user": "user"}, json=board)
    card = client.get("/api/board", params={"user": "user"}).json()["cards"]["card-1"]
    assert card["dueDate"] == "2026-06-15"


def test_save_and_load_labels(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board = _board_with_card(labels="bug,urgent")
    client.put("/api/board", params={"user": "user"}, json=board)
    card = client.get("/api/board", params={"user": "user"}).json()["cards"]["card-1"]
    assert card["labels"] == "bug,urgent"


def test_null_due_date_roundtrip(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board = _board_with_card(due_date=None)
    client.put("/api/board", params={"user": "user"}, json=board)
    card = client.get("/api/board", params={"user": "user"}).json()["cards"]["card-1"]
    assert card["dueDate"] is None


def test_all_priority_values_accepted(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    for priority in ("none", "low", "medium", "high"):
        board = _board_with_card(priority=priority)
        resp = client.put("/api/board", params={"user": "user"}, json=board)
        assert resp.status_code == 200, f"Failed for priority={priority}"
        assert resp.json()["cards"]["card-1"]["priority"] == priority
