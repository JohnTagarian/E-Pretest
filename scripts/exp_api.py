import os

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

from packages.shared.env_loader import load_local_env


load_local_env()

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "").strip()
if not DEEPSEEK_API_KEY:
    raise RuntimeError("Missing DEEPSEEK_API_KEY environment variable")

llm = ChatOpenAI(
    model="deepseek-chat",            
    api_key=DEEPSEEK_API_KEY,
    base_url="https://api.deepseek.com", 
    temperature=0.7                   
)
messages = [
    SystemMessage(content="คุณคือผู้ช่วยอัจฉริยะที่เชี่ยวชาญภาษาไทย"),
    HumanMessage(content="Deepseek สามารถเข้าใจภาษาไทยได้ดีแค่ไหน"),
]

response = llm.invoke(messages)

print(response.content)
