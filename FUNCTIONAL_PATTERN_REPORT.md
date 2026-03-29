# รายงาน Functional Design Patterns ที่ใช้ในโครงการ E-Pretest

## 1) บทนำ
รายงานนี้สรุป **รูปแบบการออกแบบ (Design Patterns) ที่เหมาะกับสถาปัตยกรรมแบบ Functional/Modular** ซึ่งใช้อยู่จริงในโครงการ E-Pretest โดยไม่จำเป็นต้องบังคับให้ระบบเป็น OOP/class-based

แนวทางนี้เหมาะกับโปรเจกต์เว็บยุคใหม่ที่เน้น:
- แยก concern ชัดเจน
- ทดสอบง่าย
- เปลี่ยนโค้ดได้ไวใน MVP และขยายได้ในระยะยาว

---

## 2) Functional Patterns ที่พบ

## 2.1 Functional Core, Imperative Shell
**แนวคิด:**
- Core เป็นฟังก์ชันคำนวณ/แปลงข้อมูล (pure-ish)
- Shell จัดการ side effects เช่น HTTP, DB, env, network

**หลักฐานในโปรเจกต์:**
- Functional Core:
  - `services/core_exam/quiz_service.py`
    - `strip_code_fences(...)`
    - `build_quiz_title(...)`
    - `parse_quiz_response(...)` (แปลง + validate schema)
- Imperative Shell:
  - `services/core_exam/api.py`
    - endpoint orchestration (`/exam/generate`, `/exam/submit`, `/analysis/gap/...`)
    - เรียก repo/LLM/อ่านไฟล์/โยน HTTPException

**ประโยชน์:**
- ทำให้ส่วน logic แยกจาก I/O ชัดเจน
- test logic ได้โดยไม่ต้องต่อระบบจริงทุกตัว

---

## 2.2 Pipeline / Data Transformation Pattern
**แนวคิด:**
แปลงข้อมูลเป็นขั้นตอนต่อเนื่อง: `รับข้อมูล -> normalize -> validate -> ใช้งาน/จัดเก็บ`

**หลักฐานในโปรเจกต์:**
- Backend LLM Quiz pipeline:
  - `services/core_exam/quiz_service.py`
  - flow: LLM raw text -> `strip_code_fences` -> `QuizPayloadModel.model_validate_json(...)` -> list of dict
- Backend GAP pipeline:
  - `services/core_exam/gap_service.py`
  - flow: review_items -> compact JSON -> LLM -> `GapLLMOutput` validation -> markdown
- Frontend mapping pipeline:
  - `apps/web/src/pages/QuizTestPage.jsx`
  - map payload คำถามจาก backend ให้เป็นโครงสร้างที่ UI ใช้ตรงๆ (`choices`, `correctAnswer`, `choiceExplanations`)

**ประโยชน์:**
- ลด bug จากข้อมูลไม่ตรง schema
- ขอบเขตแต่ละขั้นชัด ทำให้ debug ง่าย

---

## 2.3 Ports and Adapters (Hexagonal-style, แบบย่อ)
**แนวคิด:**
แยก Domain/Application logic ออกจาก Infrastructure โดยคั่นด้วย boundary

**หลักฐานในโปรเจกต์:**
- Adapter ฝั่ง DB:
  - `packages/db_postgres/quiz_repo.py`
  - `packages/db_postgres/attempt_repo.py`
  - `packages/db_postgres/user_repo.py`
- Adapter ฝั่ง API/HTTP:
  - `apps/web/src/lib_api.js` (`apiRequest`)
- Application orchestration:
  - `services/core_exam/api.py`
  - `services/auth/api.py`

**ประโยชน์:**
- เปลี่ยนเทคโนโลยี infra (เช่น DB/transport) กระทบ logic น้อยลง
- ช่วยเตรียมทางไปสู่ microservices ในอนาคต

---

## 2.4 Repository Pattern (Enterprise Pattern)
**แนวคิด:**
ซ่อนรายละเอียด persistence ไว้หลัง API ของ repository

**หลักฐานในโปรเจกต์:**
- `packages/db_postgres/quiz_repo.py`
- `packages/db_postgres/attempt_repo.py`
- `packages/db_postgres/chapter_repo.py`
- `packages/db_postgres/user_repo.py`

**ตัวอย่างบทบาท:**
- `create_quiz_set(...)`, `get_quiz_set_by_id(...)`, `list_quiz_sets_by_chapter(...)`
- `create_exam_attempt(...)`, `update_exam_attempt_gap(...)`

**ประโยชน์:**
- endpoint/service ไม่ต้องรู้ SQL รายละเอียด
- ทำให้เปลี่ยน schema/query ได้เฉพาะในชั้น repo

---

## 2.5 Schema-first Validation Pattern (Contract-driven)
**แนวคิด:**
ใช้ schema เป็น contract กลางก่อนส่ง/รับข้อมูลสำคัญ

**หลักฐานในโปรเจกต์:**
- `services/core_exam/models.py`
  - `QuizQuestionModel`, `QuizPayloadModel`, `GapLLMOutput`, response models
- ถูกใช้โดย:
  - `services/core_exam/quiz_service.py` (`QuizPayloadModel`)
  - `services/core_exam/gap_service.py` (`GapLLMOutput`)
  - `services/core_exam/api.py` (response_model)

**ประโยชน์:**
- กัน payload ผิดรูปแบบตั้งแต่ boundary
- ลดโอกาสข้อมูลเสียไหลเข้า DB/UI

---

## 2.6 Module Pattern (File-level Encapsulation)
**แนวคิด:**
ใช้ file/module เป็นหน่วย encapsulation ของพฤติกรรมที่เกี่ยวข้อง

**หลักฐานในโปรเจกต์:**
- Auth state utility: `apps/web/src/lib_auth.js`
- API utility: `apps/web/src/lib_api.js`
- Exam generation logic: `services/core_exam/quiz_service.py`
- GAP logic: `services/core_exam/gap_service.py`

**ประโยชน์:**
- อ่านง่าย แยก ownership ชัด
- ลดการพึ่งพากันแบบข้ามไฟล์โดยไม่จำเป็น

---

## 3) สรุปเชิงสถาปัตยกรรม
ระบบนี้ไม่ได้ใช้ OOP หนัก แต่มี pattern สำคัญครบสำหรับงาน production-minded:
- **Functional Core, Imperative Shell**
- **Pipeline/Transformation**
- **Ports & Adapters**
- **Repository**
- **Schema-first Validation**
- **Module Encapsulation**

สรุปคือโค้ดปัจจุบันมีโครงสร้างที่ “เป็นวิศวกรรม” และอธิบายได้ด้วย Functional Pattern อย่างชัดเจน โดยไม่ต้องบังคับ refactor ทั้งระบบเป็น class

---

## 4) ตาราง Mapping แบบย่อ
- Functional Core: `services/core_exam/quiz_service.py`, `services/core_exam/gap_service.py`
- Imperative Shell: `services/core_exam/api.py`, `services/auth/api.py`
- Pipeline: `services/core_exam/quiz_service.py`, `apps/web/src/pages/QuizTestPage.jsx`
- Ports/Adapters: `apps/web/src/lib_api.js`, `packages/db_postgres/*_repo.py`
- Repository: `packages/db_postgres/quiz_repo.py`, `packages/db_postgres/attempt_repo.py`
- Schema-first: `services/core_exam/models.py`
- Module pattern: `apps/web/src/lib_auth.js`, `apps/web/src/lib_api.js`
