from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .seed_data import DEFAULT_BOARD

DB_PATH = Path(
    os.getenv("KANBAN_DB_PATH", Path(__file__).resolve().parent / "data.db")
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with get_connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT,
                password_salt TEXT,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS boards (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS columns (
                id TEXT PRIMARY KEY,
                board_id TEXT NOT NULL,
                title TEXT NOT NULL,
                order_index INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(board_id) REFERENCES boards(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS cards (
                id TEXT PRIMARY KEY,
                column_id TEXT NOT NULL,
                title TEXT NOT NULL,
                details TEXT NOT NULL,
                priority TEXT NOT NULL DEFAULT 'none',
                due_date TEXT,
                labels TEXT NOT NULL DEFAULT '',
                order_index INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(column_id) REFERENCES columns(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
            CREATE INDEX IF NOT EXISTS idx_boards_user_id ON boards(user_id);
            CREATE INDEX IF NOT EXISTS idx_columns_board_id ON columns(board_id);
            CREATE INDEX IF NOT EXISTS idx_columns_order_index ON columns(order_index);
            CREATE INDEX IF NOT EXISTS idx_cards_column_id ON cards(column_id);
            CREATE INDEX IF NOT EXISTS idx_cards_order_index ON cards(order_index);
            """
        )
        # Migrate existing users table if missing new columns
        existing_cols = {
            row[1]
            for row in conn.execute("PRAGMA table_info(users)").fetchall()
        }
        if "password_hash" not in existing_cols:
            conn.execute("ALTER TABLE users ADD COLUMN password_hash TEXT")
        if "password_salt" not in existing_cols:
            conn.execute("ALTER TABLE users ADD COLUMN password_salt TEXT")

        # Migrate existing cards table if missing new columns
        card_cols = {
            row[1]
            for row in conn.execute("PRAGMA table_info(cards)").fetchall()
        }
        if "priority" not in card_cols:
            conn.execute(
                "ALTER TABLE cards ADD COLUMN priority TEXT NOT NULL DEFAULT 'none'"
            )
        if "due_date" not in card_cols:
            conn.execute("ALTER TABLE cards ADD COLUMN due_date TEXT")
        if "labels" not in card_cols:
            conn.execute(
                "ALTER TABLE cards ADD COLUMN labels TEXT NOT NULL DEFAULT ''"
            )
        conn.commit()


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------

def _hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), 260_000
    ).hex()


def register_user(username: str, password: str) -> str:
    """Create a new user with a hashed password. Returns user_id."""
    salt = secrets.token_hex(32)
    password_hash = _hash_password(password, salt)
    user_id = str(uuid.uuid4())
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO users (id, username, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?)",
            (user_id, username, password_hash, salt, _utc_now()),
        )
        conn.commit()
    return user_id


def authenticate_user(username: str, password: str) -> str | None:
    """Return user_id if credentials are valid, else None."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, password_hash, password_salt FROM users WHERE username = ?",
            (username,),
        ).fetchone()
    if not row:
        return None
    if not row["password_hash"] or not row["password_salt"]:
        # Legacy user without password — deny
        return None
    expected = _hash_password(password, row["password_salt"])
    if not hmac.compare_digest(expected, row["password_hash"]):
        return None
    return str(row["id"])


# ---------------------------------------------------------------------------
# Board management
# ---------------------------------------------------------------------------

def _get_user_id(conn: sqlite3.Connection, username: str) -> str:
    row = conn.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row:
        return str(row["id"])
    user_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO users (id, username, created_at) VALUES (?, ?, ?)",
        (user_id, username, _utc_now()),
    )
    return user_id


def _get_or_create_first_board(conn: sqlite3.Connection, user_id: str) -> str:
    row = conn.execute(
        "SELECT id FROM boards WHERE user_id = ? ORDER BY created_at LIMIT 1",
        (user_id,),
    ).fetchone()
    if row:
        return str(row["id"])
    board_id = str(uuid.uuid4())
    now = _utc_now()
    conn.execute(
        "INSERT INTO boards (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (board_id, user_id, "My Board", now, now),
    )
    return board_id


def list_boards(username: str) -> list[dict[str, str]]:
    """Return all boards for a user as [{id, title, created_at, updated_at}]."""
    with get_connection() as conn:
        user_id = _get_user_id(conn, username)
        rows = conn.execute(
            "SELECT id, title, created_at, updated_at FROM boards WHERE user_id = ? ORDER BY created_at",
            (user_id,),
        ).fetchall()
        return [dict(row) for row in rows]


def create_board(username: str, title: str) -> str:
    """Create a new board for user. Returns board_id."""
    with get_connection() as conn:
        user_id = _get_user_id(conn, username)
        board_id = str(uuid.uuid4())
        now = _utc_now()
        conn.execute(
            "INSERT INTO boards (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (board_id, user_id, title, now, now),
        )
        conn.commit()
    return board_id


def rename_board(board_id: str, username: str, title: str) -> bool:
    """Rename a board. Returns False if not found or not owned by user."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT boards.id FROM boards JOIN users ON boards.user_id = users.id WHERE boards.id = ? AND users.username = ?",
            (board_id, username),
        ).fetchone()
        if not row:
            return False
        conn.execute(
            "UPDATE boards SET title = ?, updated_at = ? WHERE id = ?",
            (title, _utc_now(), board_id),
        )
        conn.commit()
    return True


def delete_board(board_id: str, username: str) -> bool:
    """Delete a board. Returns False if not found or not owned by user."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT boards.id FROM boards JOIN users ON boards.user_id = users.id WHERE boards.id = ? AND users.username = ?",
            (board_id, username),
        ).fetchone()
        if not row:
            return False
        conn.execute("DELETE FROM boards WHERE id = ?", (board_id,))
        conn.commit()
    return True


def board_belongs_to_user(board_id: str, username: str) -> bool:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT boards.id FROM boards JOIN users ON boards.user_id = users.id WHERE boards.id = ? AND users.username = ?",
            (board_id, username),
        ).fetchone()
        return row is not None


def get_or_create_board(username: str) -> str:
    """Return the first board_id for username, creating one if needed (legacy compat)."""
    with get_connection() as conn:
        user_id = _get_user_id(conn, username)
        board_id = _get_or_create_first_board(conn, user_id)
        _seed_board_if_empty(conn, board_id)
        conn.commit()
        return board_id


def _seed_board_if_empty(conn: sqlite3.Connection, board_id: str) -> None:
    row = conn.execute(
        "SELECT COUNT(1) as count FROM columns WHERE board_id = ?", (board_id,)
    ).fetchone()
    if row and row["count"] > 0:
        return

    now = _utc_now()
    for col_index, column in enumerate(DEFAULT_BOARD["columns"]):
        col_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO columns (id, board_id, title, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            (col_id, board_id, column["title"], col_index, now, now),
        )
        for card_index, card_id in enumerate(column["cardIds"]):
            card = DEFAULT_BOARD["cards"][card_id]
            conn.execute(
                "INSERT INTO cards (id, column_id, title, details, priority, due_date, labels, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    str(uuid.uuid4()),
                    col_id,
                    card["title"],
                    card["details"],
                    "none",
                    None,
                    "",
                    card_index,
                    now,
                    now,
                ),
            )


def load_board(board_id: str) -> dict[str, Any]:
    with get_connection() as conn:
        columns_rows = conn.execute(
            "SELECT id, title FROM columns WHERE board_id = ? ORDER BY order_index",
            (board_id,),
        ).fetchall()
        columns = []
        cards: dict[str, Any] = {}

        for column in columns_rows:
            card_rows = conn.execute(
                "SELECT id, title, details, priority, due_date, labels FROM cards WHERE column_id = ? ORDER BY order_index",
                (column["id"],),
            ).fetchall()
            card_ids = []
            for card in card_rows:
                card_ids.append(card["id"])
                cards[card["id"]] = {
                    "id": card["id"],
                    "title": card["title"],
                    "details": card["details"],
                    "priority": card["priority"] or "none",
                    "dueDate": card["due_date"],
                    "labels": card["labels"] or "",
                }
            columns.append(
                {
                    "id": column["id"],
                    "title": column["title"],
                    "cardIds": card_ids,
                }
            )

        return {"columns": columns, "cards": cards}


def replace_board(board_id: str, board: dict[str, Any]) -> None:
    now = _utc_now()
    with get_connection() as conn:
        conn.execute(
            "DELETE FROM cards WHERE column_id IN (SELECT id FROM columns WHERE board_id = ?)",
            (board_id,),
        )
        conn.execute("DELETE FROM columns WHERE board_id = ?", (board_id,))

        for col_index, column in enumerate(board["columns"]):
            conn.execute(
                "INSERT INTO columns (id, board_id, title, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (column["id"], board_id, column["title"], col_index, now, now),
            )
            for card_index, card_id in enumerate(column["cardIds"]):
                card = board["cards"][card_id]
                conn.execute(
                    "INSERT INTO cards (id, column_id, title, details, priority, due_date, labels, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        card["id"],
                        column["id"],
                        card["title"],
                        card["details"],
                        card.get("priority", "none"),
                        card.get("dueDate"),
                        card.get("labels", ""),
                        card_index,
                        now,
                        now,
                    ),
                )

        conn.execute(
            "UPDATE boards SET updated_at = ? WHERE id = ?",
            (now, board_id),
        )
        conn.commit()
