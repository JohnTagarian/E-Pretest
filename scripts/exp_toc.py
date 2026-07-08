import json
import os
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_openai import ChatOpenAI 

from packages.shared.env_loader import load_local_env


load_local_env()

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "").strip()
if not DEEPSEEK_API_KEY:
    raise RuntimeError("Missing DEEPSEEK_API_KEY environment variable")

llm = ChatOpenAI(
    model="deepseek-chat",            
    api_key=DEEPSEEK_API_KEY,
    base_url="https://api.deepseek.com", 
    temperature=0.0                
)

context_data = f""

json_schema = """
    {
        "TOC":"[topic_1,topic_2,topic_3,...]" // TOC ที่สกัดออกมาได้ เช่น [topic_1:Introduction,topic_2:Meaning of S/W, topic_3:Problem of S/W]
    }
"""


messages = [
    SystemMessage(content=f"""
    คุณคือผู้เชี่ยวชาญด้านการจัดกลุ่ม หน้าที่ของคุณคือหา Table of Content ของเอกสารที่ถูกส่งมา โดยคุณจะต้องหาหัวข้อที่มีในเอกสารนั้นๆ แบ่งหมวดว่ามีหัวข้อใดบ้าง
    และ*ตอบกลับมาเป็นและ JSON เท่านั้น* รูปแบบ JSON:
    {json_schema}
"""),
    HumanMessage(content=f"จงสร้าง Table of content จากข้อมูลนี้:\n{context_data}")
]

response = llm.invoke(messages)

print(response.content)
