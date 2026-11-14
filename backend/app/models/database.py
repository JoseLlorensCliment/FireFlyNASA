"""Read-only access to the SQLite database built by pipeline/build_dataset.py."""
import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager

from app.core.config import get_settings

JSON_COLUMNS = {"keywords", "related", "contacts", "roles", "tags", "raw", "harmonized",
                "provenance", "columns", "notes", "data"}


def _row_to_dict(cursor: sqlite3.Cursor, row: tuple) -> dict:
    out = {}
    for (name, *_), value in zip(cursor.description, row):
        if name in JSON_COLUMNS and isinstance(value, str):
            try:
                value = json.loads(value)
            except json.JSONDecodeError:
                pass
        out[name] = value
    return out


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    path = get_settings().db_path
    if not path.exists():
        raise RuntimeError(f"Database not found at {path}. Run: python pipeline/build_dataset.py")
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True, check_same_thread=False)
    conn.row_factory = _row_to_dict
    try:
        yield conn
    finally:
        conn.close()


def query(sql: str, params: tuple | list = ()) -> list[dict]:
    with connect() as conn:
        return conn.execute(sql, params).fetchall()


def query_one(sql: str, params: tuple | list = ()) -> dict | None:
    rows = query(sql, params)
    return rows[0] if rows else None
