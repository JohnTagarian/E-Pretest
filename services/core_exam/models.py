from pydantic import BaseModel


class ExtractChapterResponse(BaseModel):
    chapter_id: int
    chapter_name: str
    status: str
    output_path: str
    num_chars: int


class ChapterTocResponse(BaseModel):
    chapter_id: int
    toc: list[str]
    source_md_path: str
    method: str
    updated_at: str
