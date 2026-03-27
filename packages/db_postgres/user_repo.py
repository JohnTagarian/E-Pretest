from __future__ import annotations

import os
from dataclasses import dataclass

import psycopg
from packages.shared.env_loader import load_local_env

load_local_env()


@dataclass
class DbUser:
    id: int
    email: str
    full_name: str
    role: str


def _database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        url = os.getenv("POSTGRES_URL", "").strip()
    if not url:
        raise RuntimeError("DATABASE_URL is not set (or POSTGRES_URL fallback)")
    return url


def upsert_user_from_google(email: str, full_name: str) -> DbUser:
    sql = """
    INSERT INTO users (email, full_name)
    VALUES (%s, %s)
    ON CONFLICT (email)
    DO UPDATE SET full_name = EXCLUDED.full_name
    RETURNING id, email, full_name, role
    """

    with psycopg.connect(_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (email, full_name))
            row = cur.fetchone()
        conn.commit()

    if not row:
        raise RuntimeError("Failed to upsert user")

    return DbUser(id=row[0], email=row[1], full_name=row[2], role=row[3])


def get_user_by_id(user_id: int) -> DbUser | None:
    sql = """
    SELECT id, email, full_name, role
    FROM users
    WHERE id = %s
    """

    with psycopg.connect(_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (user_id,))
            row = cur.fetchone()

    if not row:
        return None
    return DbUser(id=row[0], email=row[1], full_name=row[2], role=row[3])
