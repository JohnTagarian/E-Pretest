import json
import logging
import os
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_openai import ChatOpenAI

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")

MODEL_NAME = "deepseek-chat"
BASE_URL = "https://api.deepseek.com"
TEMPERATURE = 0.1

# logging.basicConfig(
#     level=logging.INFO,
#     format="%(asctime)s | %(levelname)s | %(message)s",
# )
logger = logging.getLogger(__name__)

llm = ChatOpenAI(
    model=MODEL_NAME,
    api_key=DEEPSEEK_API_KEY,
    base_url=BASE_URL,
    temperature=TEMPERATURE,
)

json_schema = """
    {
        "TOC": ["topic_1", "topic_2", "topic_3"]
    }
"""

def strip_code_fences(text: str) -> str:
    return text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()


def parse_toc(raw_text: str) -> list[str]:
    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise ValueError("TOC response is not valid JSON") from exc

    toc = parsed.get("TOC")
    if not isinstance(toc, list) or not toc:
        raise ValueError("TOC must be a non-empty list")

    normalized_toc: list[str] = []
    for item in toc:
        if not isinstance(item, str) or not item.strip():
            raise ValueError("Each TOC item must be a non-empty string")
        normalized_toc.append(item.strip())
    return normalized_toc


def build_toc_from_markdown(context_data: str, verbose: bool = True) -> tuple[list[str], str]:
    """Use LLM to extract Table of Contents from markdown text."""
    messages = [
        SystemMessage(content=f"""
        คุณคือผู้เชี่ยวชาญด้านการจัดกลุ่มเนื้อหา หน้าที่ของคุณคือหา Table of Content (TOC) จากเอกสารที่ได้รับ
        
        เงื่อนไขสำคัญ:
        1. สกัดเฉพาะหัวข้อที่มีอยู่ในเอกสารจริงๆ และนำมาจัดหมวดหมู่หลัก (Categorize) ให้ชัดเจน
        2. ไม่เจาะจงลึกถึงหัวข้อย่อย (Sub-topics) ที่ยิบย่อยจนเกินไป
        3. ไม่เอาหัวข้อที่เกี่ยวกับการสรุป (Summary) หรืออ้างอิง
        4. ตอบกลับเป็นรูปแบบ JSON ตาม Schema นี้เท่านั้น:
        {json_schema}
        """),
        HumanMessage(content=f"จงสร้าง Table of content จากข้อมูลนี้:\n{context_data}")
    ]

    res = llm.invoke(messages)

    if verbose:
        logger.info("--- LLM TOC Extraction ---")
        logger.info("Usage: %s", res.response_metadata.get("token_usage", {}))
        logger.info("Model: %s", res.response_metadata.get("model_name"))
        logger.info("Finish reason: %s", res.response_metadata.get("finish_reason"))

    raw = strip_code_fences(res.content)
    return parse_toc(raw), "llm_extraction"


def read_markdown_file(file_path: str) -> str:
    """Reads the raw text contents of a file."""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        raise FileNotFoundError(f"ไม่พบไฟล์: '{file_path}'")
    except Exception as e:
        raise RuntimeError(f"เกิดข้อผิดพลาด: {e}")


