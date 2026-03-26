import json
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_openai import ChatOpenAI 

llm = ChatOpenAI(
    model="deepseek-chat",            
    api_key="sk-f84e168441a948b4b59ff56016f38e28",
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