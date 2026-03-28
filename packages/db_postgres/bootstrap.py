from __future__ import annotations

import os
import sys
from pathlib import Path

import psycopg
try:
    from packages.shared.env_loader import load_local_env
except ModuleNotFoundError:
    # Support running as: python packages/db_postgres/bootstrap.py
    repo_root = Path(__file__).resolve().parents[2]
    if str(repo_root) not in sys.path:
        sys.path.append(str(repo_root))
    from packages.shared.env_loader import load_local_env

load_local_env()

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS materials (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  uploaded_by_user_id INTEGER NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subjects (
  id SERIAL PRIMARY KEY,
  subject_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chapters (
  id SERIAL PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  chapter_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  uploaded_by_user_id INTEGER NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chapter_tocs (
  chapter_id INTEGER PRIMARY KEY REFERENCES chapters(id) ON DELETE CASCADE,
  toc_json JSONB NOT NULL,
  source_md_path TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'markdown_heading',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quiz_sets (
  id SERIAL PRIMARY KEY,
  chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  questions_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam_attempts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  quiz_set_id INTEGER NOT NULL REFERENCES quiz_sets(id) ON DELETE CASCADE,
  answers_json JSONB NOT NULL,
  result_json JSONB NOT NULL,
  score INTEGER NOT NULL,
  total_questions INTEGER NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


"""


def init_db() -> None:
    database_url = os.getenv("DATABASE_URL", "").strip()

    if not database_url:
        database_url = os.getenv("POSTGRES_URL", "").strip()

    if not database_url:
        raise RuntimeError("DATABASE_URL is not set (or POSTGRES_URL fallback)")

    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(SCHEMA_SQL)
        conn.commit()


if __name__ == "__main__":
    init_db()
    print("DB schema initialized")
