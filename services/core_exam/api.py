from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from packages.db_postgres.chapter_repo import get_chapter_by_id
from packages.db_postgres.attempt_repo import (
    count_attempts_by_user_chapter,
    create_exam_attempt,
    get_exam_attempt_by_id,
    update_exam_attempt_gap,
)
from packages.db_postgres.chapter_toc_repo import get_chapter_toc
from packages.db_postgres.mastery_repo import (
    get_or_create_mastery,
    update_mastery_from_graded_items,
)
from packages.db_postgres.quiz_repo import (
    create_quiz_set,
    get_quiz_set_by_id,
    list_quiz_sets_by_chapter,
)
from services.auth.models import UserPublic
from services.auth.session import get_admin_user, get_current_user
from services.core_exam.models import (
    ChapterTocResponse,
    ChapterMasteryResponse,
    ExamAttemptDetailResponse,
    ExtractChapterResponse,
    GenerateQuizResponse,
    QuizSetDetailResponse,
    QuizSetSummaryResponse,
    SubmitExamRequest,
    SubmitExamResponse,
    GapAnalysisResponse,
)
from services.core_exam.extract_service import extract_and_save_markdown
from services.core_exam.quiz_service import (
    build_quiz_title,
    generate_questions_from_llm,
    read_markdown_file,
)
from services.core_exam.gap_service import build_gap_markdown


router = APIRouter(
    prefix="/core",
    tags=["core_exam"], 
)

def _ensure_attempt_access(attempt, current_user: UserPublic) -> None:
    if attempt.user_id != int(current_user.user_id) and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to access this attempt")


def _mastery_level_label(mastery: float) -> str:
    pct = int(round(mastery * 100))
    if pct <= 19:
        return "Novice"
    if pct <= 39:
        return "Developing"
    if pct <= 59:
        return "Competent"
    if pct <= 79:
        return "Proficient"
    return "Mastered"


def _difficulty_plan_for_generation(attempt_count: int, mastery: float, number_of_questions: int) -> tuple[list[int], list[int]]:
    if attempt_count == 0:
        base = [1, 1, 2, 2, 3]
    elif mastery < 0.35:
        base = [1, 1, 2, 2, 2]
    elif mastery < 0.55:
        base = [2, 2, 2, 3, 3]
    elif mastery < 0.75:
        base = [3, 3, 3, 4, 4]
    else:
        base = [4, 4, 5, 5, 5]

    if number_of_questions <= len(base):
        target_levels = base[:number_of_questions]
    else:
        target_levels = (base * ((number_of_questions // len(base)) + 1))[:number_of_questions]

    allowed_levels = sorted(set(target_levels))
    return allowed_levels, target_levels



@router.post("/chapters/{chapter_id}/extract", response_model=ExtractChapterResponse)
def extract_chapter_to_markdown(
    chapter_id: int,
    _: UserPublic = Depends(get_admin_user),
) -> ExtractChapterResponse:
    chapter = get_chapter_by_id(chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    pdf_path = Path(chapter.file_path)
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="Chapter PDF file not found")

    output_path = Path(f"outputs/markdown/subject_id_{chapter.subject_id}") / f"chapter_{chapter.id}.md"
    try:
        result = extract_and_save_markdown(str(pdf_path), str(output_path))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Extract failed: {exc}") from exc

    return ExtractChapterResponse(
        chapter_id=chapter.id,
        chapter_name=chapter.chapter_name,
        status=result["status"],
        output_path=result["output_path"],
        num_chars=result["num_chars"],
    )


@router.get("/chapters/{chapter_id}/toc", response_model=ChapterTocResponse)
def get_chapter_toc_api(
    chapter_id: int,
    _: UserPublic = Depends(get_current_user),
) -> ChapterTocResponse:
    chapter = get_chapter_by_id(chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    toc_row = get_chapter_toc(chapter_id)
    if not toc_row:
        raise HTTPException(status_code=404, detail="TOC not found")

    return ChapterTocResponse(
        chapter_id=toc_row.chapter_id,
        toc=toc_row.toc_json,
        source_md_path=toc_row.source_md_path,
        method=toc_row.method,
        updated_at=toc_row.updated_at,
    )


@router.post("/exam/generate/{chapter_id}", response_model=GenerateQuizResponse)
def generate_exam_set(
    chapter_id: int,
    current_user: UserPublic = Depends(get_current_user),
) -> GenerateQuizResponse:
    chapter = get_chapter_by_id(chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    toc_row = get_chapter_toc(chapter_id)
    if not toc_row:
        raise HTTPException(status_code=400, detail="TOC not found. Please upload/extract chapter first.")


    toc_items = toc_row.toc_json or []
    if not toc_items:
        raise HTTPException(status_code=400, detail="TOC is empty")

    number_of_questions = 5
    user_id = int(current_user.user_id)
    attempt_count = count_attempts_by_user_chapter(user_id, chapter_id)
    mastery_row = get_or_create_mastery(user_id, chapter_id)
    allowed_levels, target_levels = _difficulty_plan_for_generation(
        attempt_count=attempt_count,
        mastery=float(mastery_row.mastery),
        number_of_questions=number_of_questions,
    )
    
    try:
        context_data = read_markdown_file(toc_row.source_md_path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Cannot read markdown source: {exc}") from exc
    
    try:
        questions = generate_questions_from_llm(
            context_data=context_data,
            toc=toc_items,
            number_of_questions=number_of_questions,
            allowed_levels=allowed_levels,
            target_levels=target_levels,
            retry=1,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Generate exam failed: {exc}") from exc

    # Hard enforce first attempt difficulty <= 3
    if attempt_count == 0:
        for q in questions:
            level = int(q.get("level", 1))
            if level > 3:
                q["level"] = 3
    
    mastery_percent = int(round(float(mastery_row.mastery) * 100))
    mastery_level = _mastery_level_label(float(mastery_row.mastery))
    title = build_quiz_title(
        chapter.chapter_name,
        mastery_level=mastery_level,
        mastery_percent=mastery_percent,
    )

    created = create_quiz_set(
        chapter_id=chapter.id,
        title=title,
        questions=questions,
        created_by_user_id=int(current_user.user_id),
    )

    return GenerateQuizResponse(
        quiz_set_id=created.id,
        chapter_id=created.chapter_id,
        title=created.title,
        status=created.status,
        question_count=len(created.questions_json),
        created_at=created.created_at,
    )

@router.get("/exam/sets/{chapter_id}", response_model=list[QuizSetSummaryResponse])
def list_exam_sets(
    chapter_id: int,
    _: UserPublic = Depends(get_current_user),
) -> list[QuizSetSummaryResponse]:
    chapter = get_chapter_by_id(chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    rows = list_quiz_sets_by_chapter(chapter_id)
    return [
        QuizSetSummaryResponse(
            quiz_set_id=r.id,
            chapter_id=r.chapter_id,
            title=r.title,
            status=r.status,
            question_count=len(r.questions_json or []),
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.get("/exam/set/{quiz_set_id}", response_model=QuizSetDetailResponse)
def get_exam_set_detail(
    quiz_set_id: int,
    _: UserPublic = Depends(get_current_user),
) -> QuizSetDetailResponse:
    quiz_set = get_quiz_set_by_id(quiz_set_id)
    if not quiz_set:
        raise HTTPException(status_code=404, detail="Quiz set not found")

    return QuizSetDetailResponse(
        quiz_set_id=quiz_set.id,
        chapter_id=quiz_set.chapter_id,
        title=quiz_set.title,
        status=quiz_set.status,
        question_count=len(quiz_set.questions_json or []),
        questions=quiz_set.questions_json or [],
        created_at=quiz_set.created_at,
    )


@router.post("/exam/submit/{quiz_set_id}", response_model=SubmitExamResponse)
def submit_exam(
    quiz_set_id: int,
    payload: SubmitExamRequest,
    current_user: UserPublic = Depends(get_current_user),
) -> SubmitExamResponse:
    quiz_set = get_quiz_set_by_id(quiz_set_id)
    if not quiz_set:
        raise HTTPException(status_code=404, detail="Quiz set not found")

    questions = quiz_set.questions_json or []
    answers = payload.answers or {}
    total_questions = len(questions)

    valid_question_ids = {str(i) for i in range(1, total_questions + 1)}
    for question_id, selected_choice in answers.items():
        if question_id not in valid_question_ids:
            raise HTTPException(status_code=400, detail=f"Invalid question_id: {question_id}")
        if selected_choice not in [1, 2, 3, 4]:
            raise HTTPException(status_code=400, detail=f"Invalid choice for question {question_id}: must be 1..4")

    review_items = []
    score = 0
    for idx, q in enumerate(questions, start=1):
        qid = str(idx)
        selected = answers.get(qid)
        correct = q.get("correct_answer")
        is_correct = selected is not None and int(selected) == int(correct)
        if is_correct:
            score += 1

        review_items.append({
            "question_id": qid,
            "question": q.get("question"),
            "selected": selected,
            "correct": correct,
            "is_correct": is_correct,
            "level": int(q.get("level", 1)),
            "choice_1": q.get("choice_1"),
            "choice_2": q.get("choice_2"),
            "choice_3": q.get("choice_3"),
            "choice_4": q.get("choice_4"),
            "choice_1_exp": q.get("choice_1_exp"),
            "choice_2_exp": q.get("choice_2_exp"),
            "choice_3_exp": q.get("choice_3_exp"),
            "choice_4_exp": q.get("choice_4_exp"),
        })

    result_json = {"review_items": review_items}

    attempt = create_exam_attempt(
        user_id=int(current_user.user_id),
        quiz_set_id=quiz_set_id,
        answers=answers,
        result=result_json,
        score=score,
        total_questions=total_questions,
    )

    update_mastery_from_graded_items(
        user_id=int(current_user.user_id),
        chapter_id=int(quiz_set.chapter_id),
        graded_items=review_items,
    )

    return SubmitExamResponse(
        attempt_id=attempt.id,
        quiz_set_id=attempt.quiz_set_id,
        score=attempt.score,
        total_questions=attempt.total_questions,
        submitted_at=attempt.submitted_at,
    )


@router.get("/exam/attempt/{attempt_id}", response_model=ExamAttemptDetailResponse)
def get_exam_attempt(
    attempt_id: int,
    current_user: UserPublic = Depends(get_current_user),
) -> ExamAttemptDetailResponse:
    attempt = get_exam_attempt_by_id(attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    if attempt.user_id != int(current_user.user_id) and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to view this attempt")

    return ExamAttemptDetailResponse(
        attempt_id=attempt.id,
        quiz_set_id=attempt.quiz_set_id,
        score=attempt.score,
        total_questions=attempt.total_questions,
        submitted_at=attempt.submitted_at,
        answers=attempt.answers_json or {},
        result=attempt.result_json or {},
    )


@router.get("/analysis/gap/{attempt_id}", response_model=GapAnalysisResponse)
def get_gap_analysis(
    attempt_id: int,
    current_user: UserPublic = Depends(get_current_user),
) -> GapAnalysisResponse:
    attempt = get_exam_attempt_by_id(attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    _ensure_attempt_access(attempt, current_user)

    return GapAnalysisResponse(
        attempt_id=attempt.id,
        gap_status=attempt.gap_status,
        gap_markdown=attempt.gap_markdown,
        gap_generated_at=attempt.gap_generated_at,
    )


@router.post("/analysis/gap/{attempt_id}/generate", response_model=GapAnalysisResponse)
def generate_gap_analysis(
    attempt_id: int,
    current_user: UserPublic = Depends(get_current_user),
) -> GapAnalysisResponse:
    attempt = get_exam_attempt_by_id(attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
    _ensure_attempt_access(attempt, current_user)

    review_items = (attempt.result_json or {}).get("review_items", [])
    if not isinstance(review_items, list) or not review_items:
        raise HTTPException(status_code=400, detail="No review data in this attempt")

    # mark generating
    update_exam_attempt_gap(attempt_id, "generating", None)

    try:
        gap_markdown = build_gap_markdown(review_items)
    except Exception as exc:
        update_exam_attempt_gap(attempt_id, "failed", None)
        raise HTTPException(status_code=500, detail=f"GAP generation failed: {exc}") from exc

    updated = update_exam_attempt_gap(attempt_id, "ready", gap_markdown)
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to persist GAP result")

    return GapAnalysisResponse(
        attempt_id=updated.id,
        gap_status=updated.gap_status,
        gap_markdown=updated.gap_markdown,
        gap_generated_at=updated.gap_generated_at,
    )


@router.get("/mastery/chapter/{chapter_id}", response_model=ChapterMasteryResponse)
def get_chapter_mastery(
    chapter_id: int,
    current_user: UserPublic = Depends(get_current_user),
) -> ChapterMasteryResponse:
    """
    Get mastery information for a specific chapter.
    """
    chapter = get_chapter_by_id(chapter_id)
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    user_id = int(current_user.user_id)
    mastery_row = get_or_create_mastery(user_id=user_id, chapter_id=chapter_id)
    attempt_count = count_attempts_by_user_chapter(user_id=user_id, chapter_id=chapter_id)
    mastery_percent = int(round(float(mastery_row.mastery) * 100))

    return ChapterMasteryResponse(
        chapter_id=chapter_id,
        attempt_count=attempt_count,
        alpha=float(mastery_row.alpha),
        beta=float(mastery_row.beta),
        mastery=float(mastery_row.mastery),
        mastery_percent=mastery_percent,
        mastery_level=_mastery_level_label(float(mastery_row.mastery)),
    )
