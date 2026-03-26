import json
import logging
import os
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_openai import ChatOpenAI

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
if not DEEPSEEK_API_KEY:
    raise RuntimeError("Missing DEEPSEEK_API_KEY environment variable")

MODEL_NAME = "deepseek-chat"
BASE_URL = "https://api.deepseek.com"
TEMPERATURE = 0.0
NUMBER_OF_QUESTIONS = 2
INPUT_MARKDOWN_PATH = "outputs/markdown/Ch1_markdown.md"
OUTPUT_QUIZ_PATH = "outputs/quiz/generated_quiz.json"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)
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


def build_TOC(context_data: str, verbose: bool = True) -> list[str]:
    """Build messages with the actual context - called after file is read."""
    messages = [
        SystemMessage(content=f"""
        คุณคือผู้เชี่ยวชาญด้านการจัดกลุ่ม หน้าที่ของคุณคือหา Table of Content ของเอกสารที่ถูกส่งมา โดยคุณจะต้องหาหัวข้อที่มีในเอกสารนั้นๆ แบ่งหมวดว่ามีหัวข้อใดบ้าง
        โดยหัวข้อที่คุณสกัดออกมาจะต้องเป็นหัวข้อที่มีอยู่ในเอกสารจริงๆ และมีความเกี่ยวข้องกับเนื้อหาในเอกสารนั้นๆ แต่ไม่จำเป็นต้องแบ่งตามหัวข้อย่อยที่มีอยู่ในเอกสาร เพราะบางเอกสารอาจไม่มีหัวข้อย่อยที่ชัดเจน
        คิดต้องอ่านทั้งหมดอนุมานหัวข้อ โดยที่หัวข้อ *ต้องมีความ Catagorize แบบหมวดได้จริงๆ ไม่ควรละเอียดยิบย่อยจนเกินไป และเอาแค่หัวข้อเดี่ยว ไม่เอาหัวข้อที่เกี่ยวกับ Summary*
        และ*ตอบกลับมาเป็นและ JSON เท่านั้น* รูปแบบ Schema JSON :
        {json_schema}
    """),
        HumanMessage(content=f"จงสร้าง Table of content จากข้อมูลนี้:\n{context_data}")
    ]

    res = llm.invoke(messages)

    if verbose:
        logger.info("Verbose Mode")
        logger.info("Usage: %s", res.response_metadata.get("token_usage", {}))
        logger.info("Model: %s", res.response_metadata.get("model_name"))
        logger.info("Finish reason: %s", res.response_metadata.get("finish_reason"))

    raw = strip_code_fences(res.content)
    return parse_toc(raw)


def read_markdown_file(file_path: str) -> str:
    """Reads the raw text contents of a file."""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        raise FileNotFoundError(f"ไม่พบไฟล์: '{file_path}'")
    except Exception as e:
        raise RuntimeError(f"เกิดข้อผิดพลาด: {e}")


def build_messages(context_data: str, toc: list[str]) -> list:
    """Build messages with the actual context - called after file is read."""

    json_template = """
    {
      "quizzes": [
        {
          "question": "คำถามข้อที่ 1",
          "question_tag": "ระบุชื่อหัวข้อที่เกี่ยวข้องกับคำถามนี้ *เลือกมาจาก TOC*",
          "choice_1": "ตัวเลือกที่ 1",
          "choice_2": "ตัวเลือกที่ 2",
          "choice_3": "ตัวเลือกที่ 3",
          "choice_4": "ตัวเลือกที่ 4",
          "correct_answer": 1,
          "choice_1_exp": "อธิบายเหตุผล choice_1",
          "choice_2_exp": "อธิบายเหตุผล choice_2",
          "choice_3_exp": "อธิบายเหตุผล choice_3",
          "choice_4_exp": "อธิบายเหตุผล choice_4"
        }
      ]
    }
    """
    SYSTEM_PROMPT = f"""
      คุณคือผู้ช่วยอัจฉริยะที่เชี่ยวชาญการออกข้อสอบแบบปรนัย (Multiple Choice)
      หน้าที่ของคุณคืออ่านข้อมูลที่ผู้ใช้ให้มา และสร้างข้อสอบจำนวน {NUMBER_OF_QUESTIONS} ข้อจากข้อมูลนั้นให้สอดคล้องกับ Table of Content นี้ {json.dumps(toc, ensure_ascii=False)}
      คุณต้องตอบกลับมาเป็นรูปแบบ JSON เท่านั้น โดยอ้างอิงโครงสร้างแบบนี้:
      {json_template}
    """

    return [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=f"จงสร้างข้อสอบจากข้อมูลต่อไปนี้:\n{context_data}")
    ]


def generate_exam(context_data: str, toc: list[str]) -> dict | None:
    """Generate a quiz from context and return parsed JSON."""
    messages = build_messages(context_data, toc)
    response = llm.invoke(messages)

    # Strip markdown code fences if model wraps response in ```json ... ```
    raw = strip_code_fences(response.content)

    try:
        quiz_data = json.loads(raw)

        logger.info("โครงสร้าง Data ที่ได้: %s", quiz_data)
        logger.info("--- แสดงผลทีละข้อ ---")
        for i, quiz in enumerate(quiz_data.get("quizzes", [])):
            logger.info("ข้อ %s: %s", i + 1, quiz["question"])
            for j in range(1, 5):
                logger.info("  %s) %s", j, quiz[f"choice_{j}"])
            logger.info("คำตอบที่ถูกต้อง: %s", quiz["correct_answer"])

        return quiz_data

    except json.JSONDecodeError:
        logger.error("LLM ไม่ได้ตอบกลับเป็น JSON ที่ถูกต้อง")
        logger.error("ข้อความที่ได้: %s", response.content)
        return None


def save_quiz(quiz_data: dict, output_path: str = OUTPUT_QUIZ_PATH) -> None:
    """Save the full quiz_data dict (with quizzes array) as valid JSON."""
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(quiz_data, f, ensure_ascii=False, indent=4)
    logger.info("ข้อสอบถูกบันทึกใน %s", output_path)


if __name__ == "__main__":
    context_data = read_markdown_file(INPUT_MARKDOWN_PATH)
    logger.info("Loaded markdown from %s", INPUT_MARKDOWN_PATH)

    toc = build_TOC(context_data)
    logger.info("TOC ที่สกัดออกมา: %s", toc)

    quiz = generate_exam(context_data, toc)
    logger.info("Quiz Data type: %s", type(quiz))

    if quiz:
        save_quiz(quiz)
