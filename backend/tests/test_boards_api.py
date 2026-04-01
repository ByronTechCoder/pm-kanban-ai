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


def test_list_boards_empty_then_seeded(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    # GET /api/board auto-creates first board
    client.get("/api/board", params={"user": "alice"})
    response = client.get("/api/boards", params={"user": "alice"})
    assert response.status_code == 200
    boards = response.json()
    assert len(boards) == 1
    assert boards[0]["title"] == "My Board"


def test_create_board(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    response = client.post(
        "/api/boards",
        params={"user": "alice"},
        json={"title": "Sprint 1"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Sprint 1"
    assert "id" in data


def test_list_boards_multiple(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    client.post("/api/boards", params={"user": "alice"}, json={"title": "Board A"})
    client.post("/api/boards", params={"user": "alice"}, json={"title": "Board B"})
    response = client.get("/api/boards", params={"user": "alice"})
    assert response.status_code == 200
    titles = [b["title"] for b in response.json()]
    assert "Board A" in titles
    assert "Board B" in titles


def test_rename_board(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    create_resp = client.post(
        "/api/boards",
        params={"user": "alice"},
        json={"title": "Old Name"},
    )
    board_id = create_resp.json()["id"]

    patch_resp = client.patch(
        f"/api/boards/{board_id}",
        params={"user": "alice"},
        json={"title": "New Name"},
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["title"] == "New Name"


def test_rename_board_other_user_denied(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    create_resp = client.post(
        "/api/boards",
        params={"user": "alice"},
        json={"title": "Alice Board"},
    )
    board_id = create_resp.json()["id"]

    response = client.patch(
        f"/api/boards/{board_id}",
        params={"user": "bob"},
        json={"title": "Hacked"},
    )
    assert response.status_code == 404


def test_delete_board(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    create_resp = client.post(
        "/api/boards",
        params={"user": "alice"},
        json={"title": "Temporary"},
    )
    board_id = create_resp.json()["id"]

    del_resp = client.delete(f"/api/boards/{board_id}", params={"user": "alice"})
    assert del_resp.status_code == 204

    boards = client.get("/api/boards", params={"user": "alice"}).json()
    assert not any(b["id"] == board_id for b in boards)


def test_delete_board_other_user_denied(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    create_resp = client.post(
        "/api/boards",
        params={"user": "alice"},
        json={"title": "Alice Board"},
    )
    board_id = create_resp.json()["id"]

    response = client.delete(f"/api/boards/{board_id}", params={"user": "bob"})
    assert response.status_code == 404


def test_get_board_by_id(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    create_resp = client.post(
        "/api/boards",
        params={"user": "alice"},
        json={"title": "My Sprint"},
    )
    board_id = create_resp.json()["id"]

    board_resp = client.get("/api/board", params={"user": "alice", "board_id": board_id})
    assert board_resp.status_code == 200
    assert "columns" in board_resp.json()


def test_get_board_wrong_user_denied(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    create_resp = client.post(
        "/api/boards",
        params={"user": "alice"},
        json={"title": "Alice Board"},
    )
    board_id = create_resp.json()["id"]

    response = client.get("/api/board", params={"user": "bob", "board_id": board_id})
    assert response.status_code == 404


def test_put_board_by_id(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    create_resp = client.post(
        "/api/boards",
        params={"user": "alice"},
        json={"title": "My Sprint"},
    )
    board_id = create_resp.json()["id"]

    board = client.get("/api/board", params={"user": "alice", "board_id": board_id}).json()
    # Board is empty (newly created, no seed data for fresh boards)
    board["columns"] = [{"id": "col-1", "title": "Todo", "cardIds": ["card-1"]}]
    board["cards"] = {"card-1": {"id": "card-1", "title": "Task", "details": "", "priority": "none", "dueDate": None, "labels": ""}}

    put_resp = client.put(
        "/api/board",
        params={"user": "alice", "board_id": board_id},
        json=board,
    )
    assert put_resp.status_code == 200
    assert put_resp.json()["columns"][0]["title"] == "Todo"


def test_boards_user_isolation(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    # Alice and Bob each get their own boards list
    client.post("/api/boards", params={"user": "alice"}, json={"title": "Alice Board"})
    client.post("/api/boards", params={"user": "bob"}, json={"title": "Bob Board"})

    alice_boards = client.get("/api/boards", params={"user": "alice"}).json()
    bob_boards = client.get("/api/boards", params={"user": "bob"}).json()

    alice_titles = [b["title"] for b in alice_boards]
    bob_titles = [b["title"] for b in bob_boards]

    assert "Alice Board" in alice_titles
    assert "Bob Board" not in alice_titles
    assert "Bob Board" in bob_titles
    assert "Alice Board" not in bob_titles


def test_create_board_empty_title_rejected(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    response = client.post(
        "/api/boards",
        params={"user": "alice"},
        json={"title": "   "},
    )
    assert response.status_code == 400


def test_boards_requires_user(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    assert client.get("/api/boards").status_code == 400
    assert client.post("/api/boards", json={"title": "X"}).status_code == 400
