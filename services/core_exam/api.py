from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException


from packages.db_postgres.chapter_repo import get_chapter_by_id
from services.auth.models import UserPublic
from services.auth.session import get_admin_user
from services.core_exam.extract_service import extract_and_save_markdown
from services.core_exam.models import ExtractChapterResponse

from packages.db_postgres.chapter_toc_repo import get_chapter_toc
from services.auth.session import get_current_user
from services.core_exam.models import ChapterTocResponse

router = APIRouter(
    prefix="/core",
    tags=["core_exam"], 
)


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
