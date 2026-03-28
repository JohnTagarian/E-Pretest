import shutil
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from psycopg.errors import UniqueViolation

import logging
from services.core_exam.extract_service import extract_and_save_markdown
from services.core_exam.toc_service import build_toc_from_markdown
from packages.db_postgres.chapter_toc_repo import upsert_chapter_toc

from services.admin.models import ActionResponse, ChapterResponse, CreateSubjectRequest, SubjectResponse
from services.auth.models import UserPublic
from services.auth.session import get_admin_user, get_current_user

from packages.db_postgres.chapter_repo import (
    create_chapter,
    delete_chapter_by_id,
    get_chapter_by_id,
    list_chapters_by_subject,
)
from packages.db_postgres.subject_repo import (
    create_subject,
    delete_subject_by_subject_id,
    get_subject_by_subject_id,
    list_subjects,
)

router = APIRouter(
    prefix="/admin",
    tags=["admin"], 
)


@router.get("/me")
def get_admin_me(current_user: UserPublic = Depends(get_admin_user)) -> dict:
    return {
        "message": "admin access granted",
        "user_id": current_user.user_id,
        "email": current_user.email,
        "role": current_user.role,
    }


logger = logging.getLogger(__name__)

@router.post("/subjects", response_model=SubjectResponse)
def create_subject_api(
    payload: CreateSubjectRequest,
    current_user: UserPublic = Depends(get_admin_user),
) -> SubjectResponse:
    if not payload.subject_id.strip() or not payload.name.strip():
        raise HTTPException(status_code=400, detail="subject_id and name are required")
    try:
        db_subject = create_subject(
            subject_id=payload.subject_id.strip(),
            name=payload.name.strip(),
            created_by_user_id=int(current_user.user_id),
        )
    except UniqueViolation:
        raise HTTPException(status_code=400, detail="Subject ID already exists")
    return SubjectResponse(
        subject_id=db_subject.subject_id,
        name=db_subject.name,
        created_by_user_id=db_subject.created_by_user_id,
        created_at=str(db_subject.created_at),
    )

@router.get("/subjects", response_model=list[SubjectResponse])
def list_subjects_api(
    _: UserPublic = Depends(get_current_user),
) -> list[SubjectResponse]:
    rows = list_subjects()
    return [
        SubjectResponse(
            subject_id=r.subject_id,
            name=r.name,
            created_by_user_id=r.created_by_user_id,
            created_at=str(r.created_at),
        )
        for r in rows
    ]

@router.post("/subjects/{subject_id}/chapters/upload", response_model=ChapterResponse)
async def upload_chapter_api(
    subject_id: str,
    chapter_name: str = Form(...),
    file: UploadFile = File(...),
    current_user: UserPublic = Depends(get_admin_user),
) -> ChapterResponse:
    subject = get_subject_by_subject_id(subject_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF is allowed")

    upload_dir = Path("data/uploads") / subject_id
    upload_dir.mkdir(parents=True, exist_ok=True)

    safe_name = f"{uuid4().hex}.pdf"
    out_path = upload_dir / safe_name
    content = await file.read()
    out_path.write_bytes(content)

    chapter = create_chapter(
        subject_id=subject.id,
        chapter_name=chapter_name.strip(),
        file_path=str(out_path),
        uploaded_by_user_id=int(current_user.user_id),
    )

    # Auto extract markdown + build TOC (best effort, upload must still succeed)
    try:
        md_output_path = Path(f"outputs/markdown/subject_id_{subject.id}") / f"chapter_{chapter.id}.md"
        extract_result = extract_and_save_markdown(str(out_path), str(md_output_path))

        markdown_text = Path(extract_result["output_path"]).read_text(encoding="utf-8")
        toc_items, method = build_toc_from_markdown(markdown_text)

        if toc_items:
            upsert_chapter_toc(
                chapter_id=chapter.id,
                toc_items=toc_items,
                source_md_path=extract_result["output_path"],
                method=method,
            )
    except Exception as exc:
        logger.exception("Auto extract/toc failed for chapter_id=%s: %s", chapter.id, exc)

    return ChapterResponse(
        chapter_id=chapter.id,
        chapter_name=chapter.chapter_name,
        file_path=chapter.file_path,
        uploaded_by_user_id=chapter.uploaded_by_user_id,
        uploaded_at=str(chapter.uploaded_at),
    )

@router.get("/subjects/{subject_id}/chapters", response_model=list[ChapterResponse])
def list_chapters_api(
    subject_id: str,
    _: UserPublic = Depends(get_current_user),
) -> list[ChapterResponse]:
    subject = get_subject_by_subject_id(subject_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    rows = list_chapters_by_subject(subject.id)
    return [
        ChapterResponse(
            chapter_id=r.id,
            chapter_name=r.chapter_name,
            file_path=r.file_path,
            uploaded_by_user_id=r.uploaded_by_user_id,
            uploaded_at=str(r.uploaded_at),
        )
        for r in rows
    ]


@router.delete("/subjects/{subject_id}", response_model=ActionResponse)
def delete_subject_api(
    subject_id: str,
    _: UserPublic = Depends(get_admin_user),
) -> ActionResponse:
    subject = get_subject_by_subject_id(subject_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    deleted = delete_subject_by_subject_id(subject_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Subject not found")

    shutil.rmtree(Path("data/uploads") / subject_id, ignore_errors=True)
    shutil.rmtree(Path("outputs/markdown") / f"subject_id_{subject.id}", ignore_errors=True)
    return ActionResponse(success=True, message="Subject deleted")


@router.delete("/subjects/{subject_id}/chapters/{chapter_id}", response_model=ActionResponse)
def delete_chapter_api(
    subject_id: str,
    chapter_id: int,
    _: UserPublic = Depends(get_admin_user),
) -> ActionResponse:
    subject = get_subject_by_subject_id(subject_id)
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    chapter = get_chapter_by_id(chapter_id)
    if not chapter or chapter.subject_id != subject.id:
        raise HTTPException(status_code=404, detail="Chapter not found")

    deleted = delete_chapter_by_id(chapter_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Chapter not found")

    try:
        Path(chapter.file_path).unlink(missing_ok=True)
    except Exception:
        pass

    markdown_path = Path("outputs/markdown") / f"subject_id_{subject.id}" / f"chapter_{chapter.id}.md"
    markdown_path.unlink(missing_ok=True)
    return ActionResponse(success=True, message="Chapter deleted")
