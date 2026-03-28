from __future__ import annotations
import os
from dataclasses import dataclass
import psycopg
from packages.shared.env_loader import load_local_env

load_local_env()

@dataclass
class DbChapter:
    id: int
    subject_id: int
    chapter_name: str
    file_path: str
    uploaded_by_user_id: int
    uploaded_at: str

def _database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip() or os.getenv("POSTGRES_URL", "").strip()
    if not url:
        raise RuntimeError("DATABASE_URL is not set (or POSTGRES_URL fallback)")
    return url

def create_chapter(subject_id: int, chapter_name: str, file_path: str, uploaded_by_user_id: int) -> DbChapter:
    sql = """
    INSERT INTO chapters (subject_id, chapter_name, file_path, uploaded_by_user_id)
    VALUES (%s, %s, %s, %s)
    RETURNING id, subject_id, chapter_name, file_path, uploaded_by_user_id, uploaded_at
    """
    with psycopg.connect(_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (subject_id, chapter_name, file_path, uploaded_by_user_id))
            row = cur.fetchone()
        conn.commit()
    return DbChapter(*row)

def list_chapters_by_subject(subject_id: int) -> list[DbChapter]:
    sql = """
    SELECT id, subject_id, chapter_name, file_path, uploaded_by_user_id, uploaded_at
    FROM chapters
    WHERE subject_id = %s
    ORDER BY uploaded_at DESC
    """
    with psycopg.connect(_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (subject_id,))
            rows = cur.fetchall()
    return [DbChapter(*r) for r in rows]


def get_chapter_by_id(chapter_id: int) -> DbChapter | None:
    sql = """
    SELECT id, subject_id, chapter_name, file_path, uploaded_by_user_id, uploaded_at
    FROM chapters
    WHERE id = %s
    """
    with psycopg.connect(_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (chapter_id,))
            row = cur.fetchone()
    return DbChapter(*row) if row else None


def delete_chapter_by_id(chapter_id: int) -> bool:
    sql = """
    DELETE FROM chapters
    WHERE id = %s
    """
    with psycopg.connect(_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (chapter_id,))
            deleted = cur.rowcount > 0
        conn.commit()
    return deleted
