from __future__ import annotations

import os
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


def _get_board_id(conn: sqlite3.Connection, user_id: str) -> str:
    row = conn.execute(
        "SELECT id FROM boards WHERE user_id = ?", (user_id,)
    ).fetchone()
    if row:
        return str(row["id"])

    board_id = str(uuid.uuid4())
    now = _utc_now()
    conn.execute(
        "INSERT INTO boards (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (board_id, user_id, "Kanban Board", now, now),
    )
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
                "INSERT INTO cards (id, column_id, title, details, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    str(uuid.uuid4()),
                    col_id,
                    card["title"],
                    card["details"],
                    card_index,
                    now,
                    now,
                ),
            )


def get_or_create_board(username: str) -> str:
    with get_connection() as conn:
        user_id = _get_user_id(conn, username)
        board_id = _get_board_id(conn, user_id)
        _seed_board_if_empty(conn, board_id)
        conn.commit()
        return board_id


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
                "SELECT id, title, details FROM cards WHERE column_id = ? ORDER BY order_index",
                (column["id"],),
            ).fetchall()
            card_ids = []
            for card in card_rows:
                card_ids.append(card["id"])
                cards[card["id"]] = {
                    "id": card["id"],
                    "title": card["title"],
                    "details": card["details"],
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
                    "INSERT INTO cards (id, column_id, title, details, order_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (
                        card["id"],
                        column["id"],
                        card["title"],
                        card["details"],
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
