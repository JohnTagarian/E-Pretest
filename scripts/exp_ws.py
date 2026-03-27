
import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from services.core_exam.extract_service import extract_and_save_markdown

res = extract_and_save_markdown(
    "data/Ch1_SE.pdf",
    "outputs/markdown/ch1_test.md",
)

print(res)