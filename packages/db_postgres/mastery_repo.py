from __future__ import annotations

import os
from dataclasses import dataclass

import psycopg
from packages.shared.env_loader import load_local_env

load_local_env()


DIFFICULTY_WEIGHT = {
    1: 1.0,
    2: 1.2,
    3: 1.5,
    4: 1.8,
    5: 2.0,
}


@dataclass
class DbUserChapterMastery:
    user_id: int
    chapter_id: int
    alpha: float
    beta: float
    mastery: float
    updated_at: str


def _database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip() or os.getenv("POSTGRES_URL", "").strip()
    if not url:
        raise RuntimeError("DATABASE_URL is not set (or POSTGRES_URL fallback)")
    return url


def get_mastery(user_id: int, chapter_id: int) -> DbUserChapterMastery | None:
    sql = """
    SELECT user_id, chapter_id, alpha, beta, mastery, updated_at
    FROM user_chapter_mastery
    WHERE user_id = %s AND chapter_id = %s
    """
    with psycopg.connect(_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (user_id, chapter_id))
            row = cur.fetchone()
    if not row:
        return None
    return DbUserChapterMastery(
        user_id=row[0],
        chapter_id=row[1],
        alpha=float(row[2]),
        beta=float(row[3]),
        mastery=float(row[4]),
        updated_at=str(row[5]),
    )


def get_or_create_mastery(user_id: int, chapter_id: int) -> DbUserChapterMastery:
    """
Get the mastery record for a user and chapter, or create it if it doesn't exist.
    """
    sql = """
    INSERT INTO user_chapter_mastery (user_id, chapter_id)
    VALUES (%s, %s)
    ON CONFLICT (user_id, chapter_id) DO NOTHING
    RETURNING user_id, chapter_id, alpha, beta, mastery, updated_at
    """
    with psycopg.connect(_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (user_id, chapter_id))
            row = cur.fetchone()
        conn.commit()

    if row:
        return DbUserChapterMastery(
            user_id=row[0],
            chapter_id=row[1],
            alpha=float(row[2]),
            beta=float(row[3]),
            mastery=float(row[4]),
            updated_at=str(row[5]),
        )

    existing = get_mastery(user_id, chapter_id)
    if not existing:
        raise RuntimeError("Failed to get_or_create mastery row")
    return existing


def update_mastery_from_graded_items(
    user_id: int,
    chapter_id: int,
    graded_items: list[dict],
) -> DbUserChapterMastery:
    """
    Update the mastery record for a user and chapter based on graded items.
    Graded items = list of dicts with keys: "is_correct" (bool) and "level" (int, 1-5)
    """
    current = get_or_create_mastery(user_id, chapter_id)
    alpha = float(current.alpha)
    beta = float(current.beta)

    for item in graded_items:
        is_correct = bool(item.get("is_correct"))
        level = int(item.get("level", 1))
        weight = DIFFICULTY_WEIGHT.get(level, 1.0)
        if is_correct:
            alpha += weight
        else:
            beta += weight

    mastery = alpha / (alpha + beta) if (alpha + beta) > 0 else 0.5

    sql = """
    UPDATE user_chapter_mastery
    SET alpha = %s,
        beta = %s,
        mastery = %s,
        updated_at = NOW()
    WHERE user_id = %s AND chapter_id = %s
    RETURNING user_id, chapter_id, alpha, beta, mastery, updated_at
    """
    with psycopg.connect(_database_url()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (alpha, beta, mastery, user_id, chapter_id))
            row = cur.fetchone()
        conn.commit()

    if not row:
        raise RuntimeError("Failed to update mastery row")

    return DbUserChapterMastery(
        user_id=row[0],
        chapter_id=row[1],
        alpha=float(row[2]),
        beta=float(row[3]),
        mastery=float(row[4]),
        updated_at=str(row[5]),
    )
