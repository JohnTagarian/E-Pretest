from fastapi import APIRouter, Depends, HTTPException
from psycopg.errors import UniqueViolation

from packages.db_postgres.subject_repo import create_subject, list_subjects
from services.admin.models import CreateSubjectRequest, SubjectResponse
from services.auth.models import UserPublic
from services.auth.session import get_admin_user

from pathlib import Path
from uuid import uuid4
from fastapi import UploadFile, File, Form
from packages.db_postgres.chapter_repo import create_chapter, list_chapters_by_subject
from packages.db_postgres.subject_repo import get_subject_by_subject_id
from services.admin.models import ChapterResponse



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
    _: UserPublic = Depends(get_admin_user),
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
    _: UserPublic = Depends(get_admin_user),
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
