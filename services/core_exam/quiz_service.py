from __future__ import annotations

import json
import os
from datetime import datetime

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pydantic import ValidationError
from services.core_exam.models import QuizPayloadModel


MODEL_NAME = "deepseek-chat"
BASE_URL = "https://api.deepseek.com"
TEMPERATURE = 0.1


def strip_code_fences(text: str) -> str:
    return text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()


def read_markdown_file(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def build_quiz_title(chapter_name: str, mastery_level: str | None = None, mastery_percent: int | None = None) -> str:
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    if mastery_level is None or mastery_percent is None:
        return f"{chapter_name} - Set {ts}"
    return f"{chapter_name} - {mastery_level} {mastery_percent}% - Set {ts}"


def _get_llm() -> ChatOpenAI:
    api_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("Missing DEEPSEEK_API_KEY environment variable")
    return ChatOpenAI(
        model=MODEL_NAME,
        api_key=api_key,
        base_url=BASE_URL,
        temperature=TEMPERATURE,
    )


def parse_quiz_response(raw_text: str) -> list[dict]:
    raw = strip_code_fences(raw_text)
    try:
        payload = QuizPayloadModel.model_validate_json(raw)
    except ValidationError as exc:
        raise ValueError(f"Invalid quiz schema: {exc}") from exc
    return [q.model_dump() for q in payload.quizzes]


def _build_messages(
    context_data: str,
    toc: list[str],
    number_of_questions: int,
    allowed_levels: list[int] | None = None,
    target_levels: list[int] | None = None,
) -> list:
    json_template = """
{
  "quizzes": [
    {
      "question": "คำถามข้อที่ 1",
      "question_tag": "หัวข้อจาก TOC",
      "choice_1": "ตัวเลือกที่ 1",
      "choice_2": "ตัวเลือกที่ 2",
      "choice_3": "ตัวเลือกที่ 3",
      "choice_4": "ตัวเลือกที่ 4",
      "correct_answer": 1,
      "level": 3,
      "choice_1_exp": "อธิบายเหตุผล choice_1",
      "choice_2_exp": "อธิบายเหตุผล choice_2",
      "choice_3_exp": "อธิบายเหตุผล choice_3",
      "choice_4_exp": "อธิบายเหตุผล choice_4"
    }
  ]
}
"""

    difficulty_instruction = "- ใช้ระดับความยาก level 1..5 ให้เหมาะสมกับเนื้อหา"
    if allowed_levels:
        uniq = sorted(set(int(x) for x in allowed_levels))
        difficulty_instruction = f"- อนุญาตให้ใช้เฉพาะระดับความยาก: {uniq}"
    if target_levels:
        difficulty_instruction += f"\n- เป้าหมายการกระจายระดับความยาก (ตามลำดับข้อที่แนะนำ): {target_levels}"

    system_prompt = f"""
คุณคือผู้ช่วยอัจฉริยะที่เชี่ยวชาญการออกข้อสอบแบบปรนัย (Multiple Choice)

หน้าที่:
- อ่านเนื้อหาที่ให้มา แล้วสร้างข้อสอบจำนวน {number_of_questions} ข้อ
- question_tag ต้องเลือกจาก TOC นี้เท่านั้น: {json.dumps(toc, ensure_ascii=False)}
{difficulty_instruction}
    ข้อกำหนดเพิ่มเติมเกี่ยวกับระดับความยาก (Level) ทั้ง 5 ระดับ ให้คุณอิงตามนิยามต่อไปนี้:
    - Level 1 (Remembering - ความจำ): ถามข้อมูลที่ระบุไว้ชัดเจนในเอกสาร เช่น การถามคำศัพท์ นิยาม ใคร ทำอะไร ที่ไหน เมื่อไหร่ 
    - Level 2 (Understanding - ความเข้าใจ): ถามเพื่อทดสอบความเข้าใจเนื้อหา เช่น การให้สรุปความ ตีความ อธิบายความหมายในบริบท หรือจับใจความสำคัญ
    - Level 3 (Applying - การประยุกต์ใช้): ถามโดยให้สถานการณ์สมมติใหม่ๆ แล้วให้ผู้สอบนำหลักการหรือความรู้ในเอกสารไปปรับใช้เพื่อหาคำตอบ
    - Level 4 (Analyzing - การวิเคราะห์): ถามให้แยกแยะความสัมพันธ์ หาเหตุและผล เปรียบเทียบความเหมือน/ต่าง หรือวิเคราะห์ว่าองค์ประกอบใดส่งผลต่อสิ่งใด
    - Level 5 (Evaluating & Synthesize - การประเมินและสังเคราะห์): คำถามขั้นสูงที่ซับซ้อน ต้องใช้การคิดเชิงวิพากษ์ (Critical Thinking) ให้ประเมินความถูกต้อง ชั่งน้ำหนักข้อดีข้อเสีย หรือต้องนำข้อมูลหลายๆ ส่วนในเอกสารมาประกอบกันเพื่อหาข้อสรุปที่ดีที่สุดตัวเลือกตัวเลือกจะมีความใกล้เคียงกันมากหลอกล่อให้สับสน
- ตอบเป็น JSON เท่านั้นตาม schema ด้านล่าง
- ห้ามใส่ markdown, ห้ามใส่ข้อความอื่นนอก JSON

Schema:
{json_template}
"""
    return [
        SystemMessage(content=system_prompt),
        HumanMessage(content=f"จงสร้างข้อสอบจากข้อมูลต่อไปนี้:\n{context_data}"),
    ]


def generate_questions_from_llm(
    context_data: str,
    toc: list[str],
    number_of_questions: int = 5,
    allowed_levels: list[int] | None = None,
    target_levels: list[int] | None = None,
    retry: int = 1,
) -> list[dict]:
    llm = _get_llm()
    messages = _build_messages(
        context_data=context_data,
        toc=toc,
        number_of_questions=number_of_questions,
        allowed_levels=allowed_levels,
        target_levels=target_levels,
    )

    last_error: Exception | None = None
    for _ in range(retry + 1):
        try:
            res = llm.invoke(messages)
            return parse_quiz_response(res.content)
        except Exception as exc:
            last_error = exc

    raise RuntimeError(f"LLM quiz generation failed: {last_error}")
