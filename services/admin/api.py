from fastapi import APIRouter, Depends, HTTPException
from psycopg.errors import UniqueViolation

from packages.db_postgres.subject_repo import create_subject, list_subjects
from services.admin.models import CreateSubjectRequest, SubjectResponse
from services.auth.models import UserPublic
from services.auth.session import get_admin_user


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
