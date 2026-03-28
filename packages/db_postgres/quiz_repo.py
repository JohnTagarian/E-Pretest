from __future__ import annotations
import os
import json
from dataclasses import dataclass
import psycopg
from packages.shared.env_loader import load_local_env

load_local_env()

@dataclass
class DbQuizSet:
    id: int
    chapter_id: int
    title: str
    questions_json: list[dict]
    status: str
    created_by_user_id: int
    created_at: str

def _database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip() or os.getenv("POSTGRES_URL", "").strip()
    if not url:
        raise RuntimeError("DATABASE_URL is not set (or POSTGRES_URL fallback)")
    return url

def create_quiz_set(chapter_id: int, title: str, questions: list[dict], created_by_user_id: int) -> DbQuizSet:
    sql = """
    INSERT INTO quiz_sets (chapter_id, title, questions_json, status, created_by_user_id)
    VALUES (%s, %s, %s::jsonb, 'ready', %s)
    RETURNING id, chapter_id, title, questions_json, status, created_by_user_id, created_at
    """
    with psycopg.connect(_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (chapter_id, title, json.dumps(questions, ensure_ascii=False), created_by_user_id))
            row = cur.fetchone()
        conn.commit()
    return DbQuizSet(
        id=row[0], chapter_id=row[1], title=row[2], questions_json=row[3],
        status=row[4], created_by_user_id=row[5], created_at=str(row[6]),
    )

def list_quiz_sets_by_chapter(chapter_id: int) -> list[DbQuizSet]:
    sql = """
    SELECT id, chapter_id, title, questions_json, status, created_by_user_id, created_at
    FROM quiz_sets
    WHERE chapter_id = %s
    ORDER BY created_at DESC
    """
    with psycopg.connect(_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (chapter_id,))
            rows = cur.fetchall()
    return [
        DbQuizSet(
            id=r[0], chapter_id=r[1], title=r[2], questions_json=r[3],
            status=r[4], created_by_user_id=r[5], created_at=str(r[6]),
        )
        for r in rows
    ]


def get_quiz_set_by_id(quiz_set_id: int) -> DbQuizSet | None:
    sql = """
    SELECT id, chapter_id, title, questions_json, status, created_by_user_id, created_at
    FROM quiz_sets
    WHERE id = %s
    """
    with psycopg.connect(_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (quiz_set_id,))
            row = cur.fetchone()
    if not row:
        return None
    return DbQuizSet(
        id=row[0], chapter_id=row[1], title=row[2], questions_json=row[3],
        status=row[4], created_by_user_id=row[5], created_at=str(row[6]),
    )
