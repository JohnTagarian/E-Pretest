from __future__ import annotations
import os
import json
from dataclasses import dataclass
import psycopg
from packages.shared.env_loader import load_local_env

load_local_env()

@dataclass
class DbExamAttempt:
    id: int
    user_id: int
    quiz_set_id: int
    answers_json: dict
    result_json: dict
    score: int
    total_questions: int
    submitted_at: str
    gap_status: str
    gap_markdown: str | None
    gap_generated_at: str | None


def _database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip() or os.getenv("POSTGRES_URL", "").strip()
    if not url:
        raise RuntimeError("DATABASE_URL is not set (or POSTGRES_URL fallback)")
    return url

def create_exam_attempt(user_id: int, quiz_set_id: int, answers: dict, result: dict, score: int, total_questions: int) -> DbExamAttempt:
    sql = """
    INSERT INTO exam_attempts (user_id, quiz_set_id, answers_json, result_json, score, total_questions)
    VALUES (%s, %s, %s::jsonb, %s::jsonb, %s, %s)
    RETURNING id, user_id, quiz_set_id, answers_json, result_json, score, total_questions, submitted_at,
              gap_status, gap_markdown, gap_generated_at
    """
    with psycopg.connect(_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (user_id, quiz_set_id, json.dumps(answers, ensure_ascii=False), json.dumps(result, ensure_ascii=False), score, total_questions))
            row = cur.fetchone()
        conn.commit()
    return DbExamAttempt(
        id=row[0], user_id=row[1], quiz_set_id=row[2], answers_json=row[3],
        result_json=row[4], score=row[5], total_questions=row[6], submitted_at=str(row[7]),
        gap_status=row[8], gap_markdown=row[9], gap_generated_at=str(row[10]) if row[10] else None,
    )

def get_exam_attempt_by_id(attempt_id: int) -> DbExamAttempt | None:
    sql = """
    SELECT id, user_id, quiz_set_id, answers_json, result_json, score, total_questions, submitted_at,
           gap_status, gap_markdown, gap_generated_at
    FROM exam_attempts
    WHERE id = %s
    """
    with psycopg.connect(_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (attempt_id,))
            row = cur.fetchone()
    if not row:
        return None
    return DbExamAttempt(
        id=row[0], user_id=row[1], quiz_set_id=row[2], answers_json=row[3],
        result_json=row[4], score=row[5], total_questions=row[6], submitted_at=str(row[7]),
        gap_status=row[8], gap_markdown=row[9], gap_generated_at=str(row[10]) if row[10] else None,
    )

def update_exam_attempt_gap(attempt_id: int, gap_status: str, gap_markdown: str | None) -> DbExamAttempt | None:
    sql = """
    UPDATE exam_attempts
    SET gap_status = %s,
        gap_markdown = %s,
        gap_generated_at = CASE WHEN %s = 'ready' THEN NOW() ELSE gap_generated_at END
    WHERE id = %s
    RETURNING id, user_id, quiz_set_id, answers_json, result_json, score, total_questions, submitted_at,
              gap_status, gap_markdown, gap_generated_at
    """
    with psycopg.connect(_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (gap_status, gap_markdown, gap_status, attempt_id))
            row = cur.fetchone()
        conn.commit()
    if not row:
        return None
    return DbExamAttempt(
        id=row[0], user_id=row[1], quiz_set_id=row[2], answers_json=row[3], result_json=row[4],
        score=row[5], total_questions=row[6], submitted_at=str(row[7]),
        gap_status=row[8], gap_markdown=row[9], gap_generated_at=str(row[10]) if row[10] else None,
    )


def count_attempts_by_user_chapter(user_id: int, chapter_id: int) -> int:
    sql = """
    SELECT COUNT(*)
    FROM exam_attempts ea
    JOIN quiz_sets qs ON qs.id = ea.quiz_set_id
    WHERE ea.user_id = %s
      AND qs.chapter_id = %s
    """
    with psycopg.connect(_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (user_id, chapter_id))
            row = cur.fetchone()
    return int(row[0]) if row else 0
