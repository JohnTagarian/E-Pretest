from pydantic import BaseModel

class CreateSubjectRequest(BaseModel):
    subject_id: str
    name: str

class SubjectResponse(BaseModel):
    subject_id: str
    name: str
    created_by_user_id: int
    created_at: str
