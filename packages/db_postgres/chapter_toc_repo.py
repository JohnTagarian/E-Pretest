from __future__ import annotations
import os
import json
from dataclasses import dataclass
import psycopg
from packages.shared.env_loader import load_local_env

load_local_env()

@dataclass
class DbChapterToc:
    chapter_id: int
    toc_json: list[str]
    source_md_path: str
    method: str
    updated_at: str

def _database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip() or os.getenv("POSTGRES_URL", "").strip()
    if not url:
        raise RuntimeError("DATABASE_URL is not set (or POSTGRES_URL fallback)")
    return url

def upsert_chapter_toc(chapter_id: int, toc_items: list[str], source_md_path: str, method: str) -> DbChapterToc:
    sql = """
    INSERT INTO chapter_tocs (chapter_id, toc_json, source_md_path, method)
    VALUES (%s, %s::jsonb, %s, %s)
    ON CONFLICT (chapter_id)
    DO UPDATE SET
      toc_json = EXCLUDED.toc_json,
      source_md_path = EXCLUDED.source_md_path,
      method = EXCLUDED.method,
      updated_at = NOW()
    RETURNING chapter_id, toc_json, source_md_path, method, updated_at
    """
    with psycopg.connect(_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (chapter_id, json.dumps(toc_items, ensure_ascii=False), source_md_path, method))
            row = cur.fetchone()
        conn.commit()
    return DbChapterToc(
        chapter_id=row[0],
        toc_json=row[1],
        source_md_path=row[2],
        method=row[3],
        updated_at=str(row[4]),
    )

def get_chapter_toc(chapter_id: int) -> DbChapterToc | None:
    sql = """
    SELECT chapter_id, toc_json, source_md_path, method, updated_at
    FROM chapter_tocs
    WHERE chapter_id = %s
    """
    with psycopg.connect(_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (chapter_id,))
            row = cur.fetchone()
    if not row:
        return None
    return DbChapterToc(
        chapter_id=row[0],
        toc_json=row[1],
        source_md_path=row[2],
        method=row[3],
        updated_at=str(row[4]),
    )
