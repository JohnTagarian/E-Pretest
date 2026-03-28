from __future__ import annotations
import json
import os

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pydantic import ValidationError

from services.core_exam.models import GapLLMOutput


MODEL_NAME = "deepseek-chat"
BASE_URL = "https://api.deepseek.com"
TEMPERATURE = 0.5


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


def _strip_code_fence(text: str) -> str:
    return text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()


def build_gap_markdown(review_items: list[dict]) -> str:
    llm = _get_llm()

    compact = []
    for r in review_items:
        compact.append({
            "question": r.get("question"),
            "selected": r.get("selected"),
            "correct": r.get("correct"),
            "is_correct": r.get("is_correct"),
            "correct_explanation": r.get(f"choice_{r.get('correct')}_exp") if r.get("correct") else None,
            "selected_explanation": r.get(f"choice_{r.get('selected')}_exp") if r.get("selected") else None,
        })

    schema = """
{
  "gap_markdown": "markdown 1 paragraph in Thai, 80-140 words, practical next-step guidance (By Using MD Style for Decorate)"
}
"""

    messages = [
        SystemMessage(content=f"""
คุณคือผู้ช่วยวิเคราะห์จุดอ่อนการเรียนรู้จากผลสอบ
กติกา:
- วิเคราะห์จากข้อมูลข้อสอบที่ผิด/ถูก
- สรุปเป็นภาษาไทย 1 ย่อหน้า (80-140 คำ)
- โฟกัสจุดอ่อนหลัก + สิ่งที่ควรทบทวนต่อ
- ห้ามกล่าวเกินข้อมูลที่มี
- ตอบเป็น JSON เท่านั้นตาม schema:
{schema}
"""),
        HumanMessage(content=f"ข้อมูลผลสอบ:\n{json.dumps(compact, ensure_ascii=False)}"),
    ]

    res = llm.invoke(messages)
    raw = _strip_code_fence(res.content)
    try:
        parsed = GapLLMOutput.model_validate_json(raw)
    except ValidationError as exc:
        raise ValueError(f"Invalid GAP JSON from LLM: {exc}") from exc

    return parsed.gap_markdown.strip()
