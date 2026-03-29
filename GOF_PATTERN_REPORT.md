# รายงาน Design Pattern (Gang of Four) ที่ใช้ในโครงการ E-Pretest

## 1) บทนำ
เอกสารนี้สรุป **GoF Design Patterns ที่ปรากฏในโปรเจกต์จริง** แม้โค้ดส่วนใหญ่จะเขียนแบบ function-based (ไม่ใช่ class-based OOP เต็มรูปแบบ) โดยใช้แนวคิด “บทบาทของ Pattern” (Role/Intent) เป็นหลัก

> หมายเหตุ: GoF เดิมนำเสนอด้วยคลาส แต่ในการพัฒนาเว็บสมัยใหม่สามารถประยุกต์แบบ function/module ได้ หากยังคงเจตนาและโครงสร้างการแก้ปัญหาเดิม

---

## 2) Pattern ที่พบ

## 2.1 Facade Pattern (Structural)
**Intent:** มีจุดเดียวที่ซ่อนความซับซ้อนของระบบย่อย

**ในโปรเจกต์นี้:**
- ไฟล์: `apps/web/src/lib_api.js`
- ฟังก์ชัน: `apiRequest(path, options)`
- บทบาท: เป็นหน้าเดียวให้ทุกหน้า UI เรียก API โดยไม่ต้องรู้รายละเอียด `fetch`, base URL, หรือรูปแบบ endpoint ภายใน

**หลักฐานจากโค้ด:**
- `ChapterExamEntryPage.jsx`, `QuizTestPage.jsx`, `SummarizeTestPlaceholderPage.jsx` เรียกผ่าน `apiRequest(...)` แทนเรียก `fetch(...)` ตรงๆ

**ผลดีที่ได้:**
- ลดการซ้ำโค้ด
- เปลี่ยน API base URL หรือแนวทางเรียกเครือข่ายได้จากจุดเดียว
- UI อ่านง่ายขึ้น

---

## 2.2 Adapter Pattern (Structural)
**Intent:** แปลงข้อมูลจากรูปแบบหนึ่งให้เข้ากับรูปแบบที่ผู้ใช้ปลายทางต้องการ

**ในโปรเจกต์นี้:**
1. Frontend Adapter
- ไฟล์: `apps/web/src/pages/QuizTestPage.jsx`
- จุดสำคัญ: map payload `questions` จาก backend ให้เป็นโมเดลที่หน้า Quiz ใช้ (`id`, `question`, `choices`, `correctAnswer`, `choiceExplanations`)

2. Frontend Adapter (Exam Sets)
- ไฟล์: `apps/web/src/pages/ChapterExamEntryPage.jsx`
- จุดสำคัญ: map รายการ exam sets จาก backend (`quiz_set_id`, `question_count`) ให้เป็นรูปที่ UI ใช้งาน (`id`, `questionCount`)

3. Backend Adapter
- ไฟล์: `services/core_exam/api.py`
- จุดสำคัญ: แปลงข้อมูลจาก DB layer (`DbQuizSet`, row) ไปเป็น response model (`QuizSetSummaryResponse`, `QuizSetDetailResponse`)

**ผลดีที่ได้:**
- แยก boundary ระหว่าง “รูปข้อมูลภายใน” กับ “รูปข้อมูลที่หน้าใช้งานจริง”
- เมื่อ schema backend เปลี่ยน กระทบ UI น้อยลง

---

## 2.3 Strategy Pattern (Behavioral, Functional Form)
**Intent:** สลับอัลกอริทึมได้ตามเงื่อนไขโดยไม่กระทบผู้เรียกหลัก

**ในโปรเจกต์นี้:**
1. Difficulty Strategy
- ไฟล์: `services/core_exam/api.py`
- ฟังก์ชัน: `_difficulty_plan_for_generation(...)`
- บทบาท: เลือกแผนความยาก (`allowed_levels`, `target_levels`) ตาม `attempt_count` และ `mastery`

2. Generation Strategy Configuration
- ไฟล์: `services/core_exam/quiz_service.py`
- ฟังก์ชัน: `_build_messages(...)`, `generate_questions_from_llm(...)`
- บทบาท: ปรับ prompt/พฤติกรรมการ generate ตาม strategy ที่รับเข้ามา

**เหตุผลที่ถือว่าเป็น Strategy:**
- แม้ไม่ใช้คลาส `Strategy` แบบคลาสสิก แต่มี “พฤติกรรมทางเลือก” ที่ถูกฉีดเข้า flow หลักผ่านพารามิเตอร์และเงื่อนไข

---

## 2.4 Singleton (Practical/Module-level Singleton)
**Intent:** มี instance กลางเดียวของ state สำคัญ

**ในโปรเจกต์นี้:**
- ไฟล์: `services/auth/session.py`
- ตัวแปร: `_token_store`
- บทบาท: token store กลางสำหรับ session ภายใน process

**ข้อสังเกต:**
- เป็น singleton เชิงปฏิบัติ (module-level shared state)
- เหมาะกับ MVP แต่ production ควรย้ายไป persistent/session store ที่รองรับ multi-instance

---

## 3) สรุปเชิงวิศวกรรม
แม้ระบบนี้เขียนแบบ function-first แต่ยังสะท้อน GoF ได้ชัดในเชิง intent ได้แก่
- **Facade**: ลด coupling ของการเรียก API
- **Adapter**: ทำ data boundary ให้เสถียร
- **Strategy**: รองรับ adaptive difficulty ได้ง่าย
- **Singleton (practical)**: จัดการ session state แบบศูนย์กลางใน MVP

แนวทางนี้เหมาะกับงานที่ต้องการส่งมอบเร็ว แต่ยังรักษาโครงสร้างที่พร้อม refactor ไป OOP/microservices ได้ในอนาคต

---

## 4) ภาคผนวก: Mapping แบบย่อ
- Facade: `apps/web/src/lib_api.js` -> `apiRequest`
- Adapter (FE): `apps/web/src/pages/QuizTestPage.jsx` (question mapping)
- Adapter (FE): `apps/web/src/pages/ChapterExamEntryPage.jsx` (exam set mapping)
- Adapter (BE): `services/core_exam/api.py` (DB -> response model)
- Strategy: `services/core_exam/api.py` -> `_difficulty_plan_for_generation`
- Strategy: `services/core_exam/quiz_service.py` -> `_build_messages`, `generate_questions_from_llm`
- Singleton (practical): `services/auth/session.py` -> `_token_store`
