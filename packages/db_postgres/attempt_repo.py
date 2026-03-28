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

def _database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip() or os.getenv("POSTGRES_URL", "").strip()
    if not url:
        raise RuntimeError("DATABASE_URL is not set (or POSTGRES_URL fallback)")
    return url

def create_exam_attempt(user_id: int, quiz_set_id: int, answers: dict, result: dict, score: int, total_questions: int) -> DbExamAttempt:
    sql = """
    INSERT INTO exam_attempts (user_id, quiz_set_id, answers_json, result_json, score, total_questions)
    VALUES (%s, %s, %s::jsonb, %s::jsonb, %s, %s)
    RETURNING id, user_id, quiz_set_id, answers_json, result_json, score, total_questions, submitted_at
    """
    with psycopg.connect(_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (user_id, quiz_set_id, json.dumps(answers, ensure_ascii=False), json.dumps(result, ensure_ascii=False), score, total_questions))
            row = cur.fetchone()
        conn.commit()
    return DbExamAttempt(
        id=row[0], user_id=row[1], quiz_set_id=row[2], answers_json=row[3],
        result_json=row[4], score=row[5], total_questions=row[6], submitted_at=str(row[7]),
    )

def get_exam_attempt_by_id(attempt_id: int) -> DbExamAttempt | None:
    sql = """
    SELECT id, user_id, quiz_set_id, answers_json, result_json, score, total_questions, submitted_at
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
    )
