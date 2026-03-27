from pydantic import BaseModel

class CreateSubjectRequest(BaseModel):
    subject_id: str
    name: str

class SubjectResponse(BaseModel):
    subject_id: str
    name: str
    created_by_user_id: int
    created_at: str

class ChapterResponse(BaseModel):
    chapter_name: str
    file_path: str
    uploaded_by_user_id: int
    uploaded_at: str

