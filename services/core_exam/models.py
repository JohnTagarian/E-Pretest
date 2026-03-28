from pydantic import BaseModel, Field


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


class GenerateQuizResponse(BaseModel):
    quiz_set_id: int
    chapter_id: int
    title: str
    status: str
    question_count: int
    created_at: str

class QuizSetSummaryResponse(BaseModel):
    quiz_set_id: int
    chapter_id: int
    title: str
    status: str
    question_count: int
    created_at: str


class QuizQuestionModel(BaseModel):
    question: str = Field(min_length=1)
    question_tag: str = Field(min_length=1)
    choice_1: str = Field(min_length=1)
    choice_2: str = Field(min_length=1)
    choice_3: str = Field(min_length=1)
    choice_4: str = Field(min_length=1)
    correct_answer: int = Field(ge=1, le=4)
    level: int = Field(ge=1, le=5)
    choice_1_exp: str = Field(min_length=1)
    choice_2_exp: str = Field(min_length=1)
    choice_3_exp: str = Field(min_length=1)
    choice_4_exp: str = Field(min_length=1)


class QuizPayloadModel(BaseModel):
    quizzes: list[QuizQuestionModel] = Field(min_length=1)


class QuizSetDetailResponse(BaseModel):
    quiz_set_id: int
    chapter_id: int
    title: str
    status: str
    question_count: int
    questions: list[QuizQuestionModel]
    created_at: str


class SubmitExamRequest(BaseModel):
    answers: dict[str, int]  # key=question_id(str), value=choice_no(1..4)

class SubmitExamResponse(BaseModel):
    attempt_id: int
    quiz_set_id: int
    score: int
    total_questions: int
    submitted_at: str

class ExamAttemptDetailResponse(BaseModel):
    attempt_id: int
    quiz_set_id: int
    score: int
    total_questions: int
    submitted_at: str
    answers: dict[str, int]
    result: dict
