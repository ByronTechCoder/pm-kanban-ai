"""Tests for change-password endpoint."""
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


def _register(client: TestClient, username: str = "alice", password: str = "password123") -> None:
    client.post("/api/auth/register", json={"username": username, "password": password})


def test_change_password_success(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    _register(client)
    resp = client.post(
        "/api/auth/change-password",
        params={"user": "alice"},
        json={"old_password": "password123", "new_password": "newpass456"},
    )
    assert resp.status_code == 200
    assert resp.json()["message"] == "password changed"


def test_can_login_with_new_password(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    _register(client)
    client.post(
        "/api/auth/change-password",
        params={"user": "alice"},
        json={"old_password": "password123", "new_password": "newpass456"},
    )
    resp = client.post("/api/auth/login", json={"username": "alice", "password": "newpass456"})
    assert resp.status_code == 200


def test_old_password_no_longer_works(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    _register(client)
    client.post(
        "/api/auth/change-password",
        params={"user": "alice"},
        json={"old_password": "password123", "new_password": "newpass456"},
    )
    resp = client.post("/api/auth/login", json={"username": "alice", "password": "password123"})
    assert resp.status_code == 401


def test_change_password_wrong_old_password(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    _register(client)
    resp = client.post(
        "/api/auth/change-password",
        params={"user": "alice"},
        json={"old_password": "wrongpassword", "new_password": "newpass456"},
    )
    assert resp.status_code == 401


def test_change_password_short_new_password(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    _register(client)
    resp = client.post(
        "/api/auth/change-password",
        params={"user": "alice"},
        json={"old_password": "password123", "new_password": "abc"},
    )
    assert resp.status_code == 400


def test_change_password_requires_user(tmp_path: Path) -> None:
    client = _get_client(tmp_path)
    resp = client.post(
        "/api/auth/change-password",
        json={"old_password": "password123", "new_password": "newpass456"},
    )
    assert resp.status_code == 400
