"""Tests for WIP limits, card duplication, and checklists."""
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


def _create_board_with_card(client: TestClient, user: str = "alice") -> tuple[str, str]:
    """Create a board with one card. Returns (board_id, card_id)."""
    resp = client.post("/api/boards", params={"user": user}, json={"title": "WIP Board"})
    board_id = resp.json()["id"]
    card_id = "card-wip-1"
    board = {
        "columns": [
            {"id": "col-1", "title": "Todo", "wipLimit": 3, "cardIds": [card_id]},
        ],
        "cards": {
            card_id: {
                "id": card_id, "title": "Task One", "details": "Details",
                "priority": "none", "dueDate": None, "labels": "",
            },
        },
    }
    client.put("/api/board", params={"user": user, "board_id": board_id}, json=board)
    return board_id, card_id


# ---------------------------------------------------------------------------
# WIP limits
# ---------------------------------------------------------------------------

def test_wip_limit_stored_and_returned(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, _ = _create_board_with_card(client)
    resp = client.get("/api/board", params={"user": "alice", "board_id": board_id})
    assert resp.status_code == 200
    col = resp.json()["columns"][0]
    assert col["wipLimit"] == 3


def test_wip_limit_null_by_default(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    resp = client.post("/api/boards", params={"user": "alice"}, json={"title": "New"})
    board_id = resp.json()["id"]
    # New board has default columns; none have wip_limit set
    board = client.get("/api/board", params={"user": "alice", "board_id": board_id}).json()
    for col in board["columns"]:
        assert col["wipLimit"] is None


def test_wip_limit_update(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, card_id = _create_board_with_card(client)
    # Update wip_limit to 5
    board = client.get("/api/board", params={"user": "alice", "board_id": board_id}).json()
    board["columns"][0]["wipLimit"] = 5
    client.put("/api/board", params={"user": "alice", "board_id": board_id}, json=board)
    updated = client.get("/api/board", params={"user": "alice", "board_id": board_id}).json()
    assert updated["columns"][0]["wipLimit"] == 5


def test_wip_limit_clear(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, card_id = _create_board_with_card(client)
    board = client.get("/api/board", params={"user": "alice", "board_id": board_id}).json()
    board["columns"][0]["wipLimit"] = None
    client.put("/api/board", params={"user": "alice", "board_id": board_id}, json=board)
    updated = client.get("/api/board", params={"user": "alice", "board_id": board_id}).json()
    assert updated["columns"][0]["wipLimit"] is None


# ---------------------------------------------------------------------------
# Card duplication
# ---------------------------------------------------------------------------

def test_duplicate_card_creates_copy(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, card_id = _create_board_with_card(client)
    resp = client.post(f"/api/cards/{card_id}/duplicate", params={"user": "alice"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Task One (copy)"
    assert data["details"] == "Details"
    assert data["id"] != card_id


def test_duplicate_card_appears_in_board(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    board_id, card_id = _create_board_with_card(client)
    client.post(f"/api/cards/{card_id}/duplicate", params={"user": "alice"})
    board = client.get("/api/board", params={"user": "alice", "board_id": board_id}).json()
    assert len(board["columns"][0]["cardIds"]) == 2


def test_duplicate_card_wrong_user(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    _, card_id = _create_board_with_card(client, "alice")
    resp = client.post(f"/api/cards/{card_id}/duplicate", params={"user": "bob"})
    assert resp.status_code == 404


def test_duplicate_nonexistent_card(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    resp = client.post("/api/cards/nonexistent/duplicate", params={"user": "alice"})
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Checklists
# ---------------------------------------------------------------------------

def test_checklist_empty_initially(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    _, card_id = _create_board_with_card(client)
    resp = client.get(f"/api/cards/{card_id}/checklist", params={"user": "alice"})
    assert resp.status_code == 200
    assert resp.json() == []


def test_add_checklist_item(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    _, card_id = _create_board_with_card(client)
    resp = client.post(
        f"/api/cards/{card_id}/checklist",
        params={"user": "alice"},
        json={"text": "Step one"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["text"] == "Step one"
    assert data["checked"] is False


def test_checklist_list_after_add(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    _, card_id = _create_board_with_card(client)
    client.post(f"/api/cards/{card_id}/checklist", params={"user": "alice"}, json={"text": "A"})
    client.post(f"/api/cards/{card_id}/checklist", params={"user": "alice"}, json={"text": "B"})
    resp = client.get(f"/api/cards/{card_id}/checklist", params={"user": "alice"})
    items = resp.json()
    assert len(items) == 2
    assert items[0]["text"] == "A"
    assert items[1]["text"] == "B"


def test_check_item(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    _, card_id = _create_board_with_card(client)
    item = client.post(
        f"/api/cards/{card_id}/checklist",
        params={"user": "alice"},
        json={"text": "Do this"},
    ).json()
    resp = client.patch(
        f"/api/checklist/{item['id']}",
        params={"user": "alice"},
        json={"checked": True},
    )
    assert resp.status_code == 200
    assert resp.json()["checked"] is True
    assert resp.json()["text"] == "Do this"


def test_update_checklist_item_text(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    _, card_id = _create_board_with_card(client)
    item = client.post(
        f"/api/cards/{card_id}/checklist",
        params={"user": "alice"},
        json={"text": "Old"},
    ).json()
    resp = client.patch(
        f"/api/checklist/{item['id']}",
        params={"user": "alice"},
        json={"text": "New"},
    )
    assert resp.json()["text"] == "New"


def test_delete_checklist_item(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    _, card_id = _create_board_with_card(client)
    item = client.post(
        f"/api/cards/{card_id}/checklist",
        params={"user": "alice"},
        json={"text": "Temp"},
    ).json()
    resp = client.delete(f"/api/checklist/{item['id']}", params={"user": "alice"})
    assert resp.status_code == 204
    items = client.get(f"/api/cards/{card_id}/checklist", params={"user": "alice"}).json()
    assert len(items) == 0


def test_checklist_empty_text_rejected(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    _, card_id = _create_board_with_card(client)
    resp = client.post(
        f"/api/cards/{card_id}/checklist",
        params={"user": "alice"},
        json={"text": ""},
    )
    assert resp.status_code == 400


def test_checklist_wrong_user_denied(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    _, card_id = _create_board_with_card(client, "alice")
    resp = client.get(f"/api/cards/{card_id}/checklist", params={"user": "bob"})
    assert resp.status_code == 404


def test_checklist_requires_user(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    _, card_id = _create_board_with_card(client)
    resp = client.get(f"/api/cards/{card_id}/checklist")
    assert resp.status_code == 400


def test_delete_nonexistent_checklist_item(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    resp = client.delete("/api/checklist/nonexistent", params={"user": "alice"})
    assert resp.status_code == 404
