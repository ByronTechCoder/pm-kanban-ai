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


def test_register_new_user(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    response = client.post(
        "/api/auth/register",
        json={"username": "alice", "password": "secure123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "alice"
    assert data["message"] == "registered"


def test_register_duplicate_username(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    client.post("/api/auth/register", json={"username": "alice", "password": "secure123"})
    response = client.post(
        "/api/auth/register",
        json={"username": "alice", "password": "different"},
    )
    assert response.status_code == 409
    assert "already taken" in response.json()["error"]


def test_register_short_password(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    response = client.post(
        "/api/auth/register",
        json={"username": "alice", "password": "abc"},
    )
    assert response.status_code == 400
    assert "password" in response.json()["error"]


def test_register_short_username(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    response = client.post(
        "/api/auth/register",
        json={"username": "a", "password": "secure123"},
    )
    assert response.status_code == 400


def test_login_valid_credentials(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    client.post("/api/auth/register", json={"username": "alice", "password": "secure123"})
    response = client.post(
        "/api/auth/login",
        json={"username": "alice", "password": "secure123"},
    )
    assert response.status_code == 200
    assert response.json()["message"] == "authenticated"


def test_login_wrong_password(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    client.post("/api/auth/register", json={"username": "alice", "password": "secure123"})
    response = client.post(
        "/api/auth/login",
        json={"username": "alice", "password": "wrongpass"},
    )
    assert response.status_code == 401
    assert "invalid credentials" in response.json()["error"]


def test_login_unknown_user(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    response = client.post(
        "/api/auth/login",
        json={"username": "nobody", "password": "secure123"},
    )
    assert response.status_code == 401
