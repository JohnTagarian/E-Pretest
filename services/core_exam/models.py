from pydantic import BaseModel


class ExtractChapterResponse(BaseModel):
    chapter_id: int
    chapter_name: str
    status: str
    output_path: str
    num_chars: int
