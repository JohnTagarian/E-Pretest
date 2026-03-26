import json



x = """
    {
        "x": [1,2,3,4]
    }
"""

try:
    data = json.loads(x)
    print("Parsed JSON:", data["x"])
except json.JSONDecodeError as e:
    print(f"เกิดข้อผิดพลาดในการแปลง JSON: {e}")