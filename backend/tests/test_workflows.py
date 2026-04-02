"""Integration tests for multi-step PM workflows."""
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


def test_full_card_lifecycle(tmp_path: Path) -> None:
    """Create → edit → archive → restore → verify."""
    client = _get_client(tmp_path)

    # Create board and card
    board_resp = client.post("/api/boards", params={"user": "alice"}, json={"title": "Sprint 1"})
    board_id = board_resp.json()["id"]
    board = {
        "columns": [
            {"id": "col-1", "title": "Todo", "wipLimit": None, "color": None, "cardIds": ["c1"]},
        ],
        "cards": {
            "c1": {"id": "c1", "title": "Add auth", "details": "login/logout", "priority": "high",
                   "dueDate": "2026-06-01", "labels": "feature", "estimate": 3},
        },
    }
    client.put("/api/board", params={"user": "alice", "board_id": board_id}, json=board)

    # Verify card is on board
    loaded = client.get("/api/board", params={"user": "alice", "board_id": board_id}).json()
    assert "c1" in loaded["cards"]
    assert loaded["cards"]["c1"]["priority"] == "high"

    # Archive card
    resp = client.post(f"/api/cards/c1/archive", params={"user": "alice", "board_id": board_id})
    assert resp.status_code == 204

    # Card should no longer be in board
    loaded = client.get("/api/board", params={"user": "alice", "board_id": board_id}).json()
    assert "c1" not in loaded["cards"]

    # Card should be in archive
    archive = client.get(f"/api/boards/{board_id}/archive", params={"user": "alice"}).json()
    assert any(c["id"] == "c1" for c in archive)

    # Restore card
    resp = client.post(f"/api/cards/c1/restore", params={"user": "alice", "board_id": board_id})
    assert resp.status_code == 200

    # Card should be back on board
    loaded = client.get("/api/board", params={"user": "alice", "board_id": board_id}).json()
    assert "c1" in loaded["cards"]

    # Archive should be empty again
    archive = client.get(f"/api/boards/{board_id}/archive", params={"user": "alice"}).json()
    assert not any(c["id"] == "c1" for c in archive)


def test_checklist_workflow(tmp_path: Path) -> None:
    """Add items, check some, verify progress."""
    client = _get_client(tmp_path)

    board_resp = client.post("/api/boards", params={"user": "bob"}, json={"title": "Project"})
    board_id = board_resp.json()["id"]
    board = {
        "columns": [{"id": "col-1", "title": "Doing", "wipLimit": None, "color": None, "cardIds": ["c1"]}],
        "cards": {"c1": {"id": "c1", "title": "Setup CI", "details": "", "priority": "none",
                         "dueDate": None, "labels": "", "estimate": None}},
    }
    client.put("/api/board", params={"user": "bob", "board_id": board_id}, json=board)

    # Add checklist items
    resp1 = client.post(f"/api/cards/c1/checklist", params={"user": "bob"}, json={"text": "Install GitHub Actions"})
    resp2 = client.post(f"/api/cards/c1/checklist", params={"user": "bob"}, json={"text": "Add test runner"})
    resp3 = client.post(f"/api/cards/c1/checklist", params={"user": "bob"}, json={"text": "Configure secrets"})
    assert resp1.status_code == 201
    item1_id = resp1.json()["id"]

    # Check off first item
    client.patch(f"/api/checklist/{item1_id}", params={"user": "bob"}, json={"checked": True})

    # Verify checklist state
    checklist = client.get(f"/api/cards/c1/checklist", params={"user": "bob"}).json()
    assert len(checklist) == 3
    checked_items = [i for i in checklist if i["checked"]]
    assert len(checked_items) == 1
    assert checked_items[0]["id"] == item1_id

    # Delete an item
    client.delete(f"/api/checklist/{resp2.json()['id']}", params={"user": "bob"})
    checklist = client.get(f"/api/cards/c1/checklist", params={"user": "bob"}).json()
    assert len(checklist) == 2


def test_multi_board_isolation(tmp_path: Path) -> None:
    """Alice and Bob have separate boards; can't access each other's data."""
    client = _get_client(tmp_path)

    # Each user creates a board
    alice_board_id = client.post("/api/boards", params={"user": "alice"}, json={"title": "Alice Board"}).json()["id"]
    bob_board_id = client.post("/api/boards", params={"user": "bob"}, json={"title": "Bob Board"}).json()["id"]

    # Each user has their own boards list
    alice_boards = [b["id"] for b in client.get("/api/boards", params={"user": "alice"}).json()]
    bob_boards = [b["id"] for b in client.get("/api/boards", params={"user": "bob"}).json()]
    assert alice_board_id in alice_boards
    assert bob_board_id not in alice_boards
    assert bob_board_id in bob_boards
    assert alice_board_id not in bob_boards

    # Cross-access is denied
    assert client.get("/api/board", params={"user": "alice", "board_id": bob_board_id}).status_code == 404
    assert client.delete(f"/api/boards/{alice_board_id}", params={"user": "bob"}).status_code == 404
    assert client.get(f"/api/boards/{bob_board_id}/stats", params={"user": "alice"}).status_code == 404


def test_label_presets_propagate_to_search(tmp_path: Path) -> None:
    """Setting label presets and then searching by those labels works end-to-end."""
    client = _get_client(tmp_path)

    board_id = client.post("/api/boards", params={"user": "alice"}, json={"title": "Labels Test"}).json()["id"]
    board = {
        "columns": [{"id": "col-1", "title": "Todo", "wipLimit": None, "color": None, "cardIds": ["c1", "c2"]}],
        "cards": {
            "c1": {"id": "c1", "title": "Bug fix", "details": "", "priority": "high",
                   "dueDate": None, "labels": "bug,backend", "estimate": None},
            "c2": {"id": "c2", "title": "Feature", "details": "", "priority": "low",
                   "dueDate": None, "labels": "feature", "estimate": None},
        },
    }
    client.put("/api/board", params={"user": "alice", "board_id": board_id}, json=board)

    # Set label presets
    client.put(f"/api/boards/{board_id}/labels", params={"user": "alice"},
               json={"labels": ["bug", "feature", "backend", "frontend"]})

    # Verify presets stored
    presets = client.get(f"/api/boards/{board_id}/labels", params={"user": "alice"}).json()
    assert "bug" in presets
    assert "feature" in presets

    # Search by label
    results = client.get(f"/api/boards/{board_id}/search", params={"user": "alice", "label": "bug"}).json()
    assert len(results) == 1
    assert results[0]["title"] == "Bug fix"

    results = client.get(f"/api/boards/{board_id}/search", params={"user": "alice", "label": "backend"}).json()
    assert len(results) == 1


def test_bulk_archive_then_restore_all(tmp_path: Path) -> None:
    """Bulk archive a column, then restore all cards."""
    client = _get_client(tmp_path)

    board_id = client.post("/api/boards", params={"user": "alice"}, json={"title": "Bulk Test"}).json()["id"]
    board = {
        "columns": [{"id": "col-1", "title": "Done", "wipLimit": None, "color": None, "cardIds": ["c1", "c2", "c3"]}],
        "cards": {
            "c1": {"id": "c1", "title": "T1", "details": "", "priority": "none", "dueDate": None, "labels": "", "estimate": None},
            "c2": {"id": "c2", "title": "T2", "details": "", "priority": "none", "dueDate": None, "labels": "", "estimate": None},
            "c3": {"id": "c3", "title": "T3", "details": "", "priority": "none", "dueDate": None, "labels": "", "estimate": None},
        },
    }
    client.put("/api/board", params={"user": "alice", "board_id": board_id}, json=board)

    # Bulk archive
    resp = client.post(f"/api/boards/{board_id}/columns/col-1/archive-all", params={"user": "alice"})
    assert resp.json()["archived_count"] == 3

    # Board is now empty
    loaded = client.get("/api/board", params={"user": "alice", "board_id": board_id}).json()
    assert loaded["columns"][0]["cardIds"] == []

    # Archive has 3 cards
    archive = client.get(f"/api/boards/{board_id}/archive", params={"user": "alice"}).json()
    assert len(archive) == 3

    # Restore all
    for card in archive:
        client.post(f"/api/cards/{card['id']}/restore", params={"user": "alice", "board_id": board_id})

    # Board has cards again
    loaded = client.get("/api/board", params={"user": "alice", "board_id": board_id}).json()
    assert len(loaded["cards"]) == 3

    # Archive is empty
    archive = client.get(f"/api/boards/{board_id}/archive", params={"user": "alice"}).json()
    assert len(archive) == 0
