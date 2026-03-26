from openai import OpenAI
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage


llm = ChatOpenAI(
    model="deepseek-chat",            
    api_key="sk-f84e168441a948b4b59ff56016f38e28",
    base_url="https://api.deepseek.com", 
    temperature=0.7                   
)
messages = [
    SystemMessage(content="คุณคือผู้ช่วยอัจฉริยะที่เชี่ยวชาญภาษาไทย"),
    HumanMessage(content="Deepseek สามารถเข้าใจภาษาไทยได้ดีแค่ไหน"),
]

response = llm.invoke(messages)

print(response.content)