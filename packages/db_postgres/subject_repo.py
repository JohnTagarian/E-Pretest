from __future__ import annotations

import os
from dataclasses import dataclass
import psycopg
from packages.shared.env_loader import load_local_env

load_local_env()

@dataclass
class DbSubject:
    id: int
    subject_id: str
    name: str
    created_by_user_id: int
    created_at: str

def _database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip() or os.getenv("POSTGRES_URL", "").strip()
    if not url:
        raise RuntimeError("DATABASE_URL is not set (or POSTGRES_URL fallback)")
    return url

def create_subject(subject_id: str, name: str, created_by_user_id: int) -> DbSubject:
    sql = """
    INSERT INTO subjects (subject_id, name, created_by_user_id)
    VALUES (%s, %s, %s)
    RETURNING id, subject_id, name, created_by_user_id, created_at
    """
    with psycopg.connect(_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (subject_id, name, created_by_user_id))
            row = cur.fetchone()
        conn.commit()
    return DbSubject(*row)

def list_subjects() -> list[DbSubject]:
    sql = """
    SELECT id, subject_id, name, created_by_user_id, created_at
    FROM subjects
    ORDER BY created_at DESC
    """
    with psycopg.connect(_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            rows = cur.fetchall()
    return [DbSubject(*r) for r in rows]

def get_subject_by_subject_id(subject_id: str) -> DbSubject | None:
    sql = """
    SELECT id, subject_id, name, created_by_user_id, created_at
    FROM subjects
    WHERE subject_id = %s
    """
    with psycopg.connect(_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (subject_id,))
            row = cur.fetchone()
    return DbSubject(*row) if row else None
