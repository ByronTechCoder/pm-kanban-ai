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


def test_missing_user_rejected(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    response = client.get("/api/board")
    assert response.status_code == 400


def test_board_roundtrip(tmp_path: Path) -> None:
    client = _get_client(tmp_path)

    response = client.get("/api/board", params={"user": "user"})
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["columns"]) == 5

    payload["columns"][0]["title"] = "Renamed"

    put_response = client.put("/api/board", params={"user": "user"}, json=payload)
    assert put_response.status_code == 200

    get_response = client.get("/api/board", params={"user": "user"})
    assert get_response.status_code == 200
    assert get_response.json()["columns"][0]["title"] == "Renamed"


def test_user_isolation(tmp_path: Path) -> None:
    client = _get_client(tmp_path)

    alice_board = client.get("/api/board", params={"user": "alice"}).json()
    original_title = alice_board["columns"][0]["title"]
    alice_board["columns"][0]["title"] = "Alice Only"
    assert client.put("/api/board", params={"user": "alice"}, json=alice_board).status_code == 200

    bob_board = client.get("/api/board", params={"user": "bob"}).json()
    assert bob_board["columns"][0]["title"] == original_title
    assert bob_board["columns"][0]["title"] != "Alice Only"

    alice_check = client.get("/api/board", params={"user": "alice"}).json()
    assert alice_check["columns"][0]["title"] == "Alice Only"


def test_put_board_rejects_orphaned_card_reference(tmp_path: Path) -> None:
    client = _get_client(tmp_path)

    board = client.get("/api/board", params={"user": "user"}).json()
    # Add a card ID to a column that doesn't exist in cards
    board["columns"][0]["cardIds"].append("nonexistent-card-id")

    response = client.put("/api/board", params={"user": "user"}, json=board)
    assert response.status_code == 422
    assert "nonexistent-card-id" in response.json()["error"]
