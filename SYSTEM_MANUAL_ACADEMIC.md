# คู่มือระบบ (System Manual) สำหรับการส่งรายวิชา
## โครงการ E-Pretest

**ฉบับ:** Academic Submission v1.0  
**วันที่ปรับปรุงล่าสุด:** 30 มีนาคม 2026  
**ผู้จัดทำ:** ทีมพัฒนา E-Pretest

[ใส่รูป: หน้าปกเอกสาร/ชื่อโครงการ]

---

## สารบัญ

1. บทนำ  
2. วัตถุประสงค์ของเอกสาร  
3. ขอบเขตระบบ  
4. สถาปัตยกรรมระบบ  
5. เทคโนโลยีและเครื่องมือที่ใช้  
6. โครงสร้างโครงการและหน้าที่ของแต่ละโมดูล  
7. ขั้นตอนติดตั้งและตั้งค่าสภาพแวดล้อม  
8. รายละเอียดฐานข้อมูล  
9. รายละเอียดการทำงานของโมดูลหลัก  
10. รายละเอียด API ของระบบ  
11. แนวทางบำรุงรักษาระบบ  
12. การทดสอบระบบและการตรวจสอบคุณภาพ  
13. ความเสี่ยง ข้อจำกัด และข้อเสนอแนะ  
14. ภาคผนวก

---

## 1) บทนำ

โครงการ E-Pretest เป็นระบบสนับสนุนการประเมินความรู้เชิงบทเรียน โดยมุ่งเน้นกระบวนการตั้งแต่การจัดการเนื้อหา (PDF), การสกัดสาระสำคัญ, การสร้างข้อสอบแบบปรนัย (MCQ), การประเมินผลผู้เรียน, และการวิเคราะห์ช่องว่างความรู้ (GAP Analysis)

ระบบได้รับการออกแบบให้พัฒนาได้รวดเร็วในระยะเริ่มต้น (MVP) และสามารถบำรุงรักษา/ขยายต่อได้ในระยะถัดไป

---

## 2) วัตถุประสงค์ของเอกสาร

เอกสารฉบับนี้มีวัตถุประสงค์เพื่อ:

- อธิบายโครงสร้างระบบในระดับสถาปัตยกรรมและระดับโค้ด
- ระบุขั้นตอนติดตั้งและใช้งานสำหรับผู้พัฒนาระบบรุ่นถัดไป
- อธิบายขอบเขตและหน้าที่ของแต่ละโมดูลหลัก
- เป็นเอกสารประกอบการประเมินผลรายวิชาในมุมมอง System Documentation

---

## 3) ขอบเขตระบบ

### 3.1 ขอบเขตที่ครอบคลุมในฉบับปัจจุบัน

- การยืนยันตัวตนผู้ใช้ด้วย Google OAuth และการจำกัดโดเมนอีเมล
- การจัดการรายวิชาและบทเรียนสำหรับผู้ดูแลระบบ
- การอัปโหลดไฟล์ PDF และสกัดเนื้อหาเป็น Markdown
- การสร้าง TOC จากเนื้อหาที่สกัดได้
- การสร้างข้อสอบ MCQ ด้วย LLM
- การทำข้อสอบ, ส่งคำตอบ, ประเมินคะแนน
- การสร้าง GAP Analysis และบันทึกผล
- การคำนวณ Mastery Profile รายบท

### 3.2 ขอบเขตที่ยังไม่เน้นในฉบับนี้

- Non-functional requirements ขั้นสูง (autoscaling, HA, full observability)
- การแยก service จริงแบบ Microservices
- Migration framework เชิงเวอร์ชัน (เช่น Alembic)

---

## 4) สถาปัตยกรรมระบบ

### 4.1 Architectural Style

ระบบปัจจุบันจัดอยู่ในรูปแบบ:

- **Client-Server Architecture**: Frontend (React) ติดต่อ Backend (FastAPI)
- **Modular Monolith**: Backend รันเป็น deployment เดียว แต่แยกโมดูลชัดเจน
- **Layered Responsibility**: API Layer -> Service Logic -> Repository/Data Layer

[ใส่รูป: Architecture Diagram (Client-Server + Modular Monolith)]

### 4.2 โมดูลหลักของ Backend

- **Auth Module**: จัดการ OAuth, session token, access control
- **Admin Module**: จัดการ Subject/Chapter, upload เอกสาร, delete ข้อมูล
- **Core Exam Module**: extract, toc, generate quiz, submit, scoring, mastery, gap
- **User Module**: endpoint ข้อมูลผู้ใช้ปัจจุบัน (`/me`)

---

## 5) เทคโนโลยีและเครื่องมือที่ใช้

### 5.1 Backend

- Python 3.12+
- FastAPI
- Uvicorn
- Psycopg3
- LangChain Core/OpenAI connector

### 5.2 Frontend

- React 18
- React Router
- Vite
- React Markdown + remark-gfm

### 5.3 Data & External Services

- PostgreSQL 16
- Google OAuth API
- DeepSeek API (LLM)

[ใส่รูป: Technology Stack Overview]

---

## 6) โครงสร้างโครงการและหน้าที่ของแต่ละโมดูล

### 6.1 โครงสร้างโฟลเดอร์หลัก

- `apps/api` : จุดเริ่ม FastAPI (`main.py`)
- `apps/web` : React application
- `services/auth` : OAuth + session
- `services/admin` : admin use-cases
- `services/core_exam` : exam engine และ analytics
- `services/user` : user profile endpoint
- `packages/db_postgres` : repository และ schema bootstrap
- `packages/shared` : utility กลาง (เช่น env loader)
- `infra` : env templates และ docker compose

[ใส่รูป: Project Tree ใน IDE]

### 6.2 ไฟล์สำคัญเชิงปฏิบัติ

- API entrypoint: `apps/api/main.py`
- Route map frontend: `apps/web/src/App.jsx`
- API facade frontend: `apps/web/src/lib_api.js`
- Token helper frontend: `apps/web/src/lib_auth.js`
- DB schema bootstrap: `packages/db_postgres/bootstrap.py`

---

## 7) ขั้นตอนติดตั้งและตั้งค่าสภาพแวดล้อม

### 7.1 เตรียม Backend

```bash
cd /home/kantinan/programming/E-Pretest
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-backend.txt
```

### 7.2 เตรียม Frontend

```bash
cd /home/kantinan/programming/E-Pretest/apps/web
npm install
```

### 7.3 เตรียม PostgreSQL

```bash
docker run --name epretest-pg \
  -e POSTGRES_DB=epretest \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5433:5432 -d postgres:16
```

### 7.4 Bootstrap Schema

```bash
cd /home/kantinan/programming/E-Pretest
python packages/db_postgres/bootstrap.py
```

### 7.5 รัน API และ Web

```bash
# Terminal 1
cd /home/kantinan/programming/E-Pretest
uvicorn apps.api.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2
cd /home/kantinan/programming/E-Pretest/apps/web
npm run dev
```

[ใส่รูป: หน้าจอ Terminal รัน backend/frontend]

### 7.6 Environment Variables

อ้างอิงไฟล์: `infra/env/.env.example`  
ค่าจำเป็น:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `OAUTH_STATE_SECRET`
- `DATABASE_URL`
- `DEEPSEEK_API_KEY`

[ใส่รูป: ตัวอย่างไฟล์ .env ที่ตั้งค่าครบ]

---

## 8) รายละเอียดฐานข้อมูล

ระบบใช้ PostgreSQL โดย schema หลักมีตารางต่อไปนี้:

- `users`
- `materials`
- `subjects`
- `chapters`
- `chapter_tocs`
- `quiz_sets`
- `exam_attempts`
- `user_chapter_mastery`

[ใส่รูป: ER Diagram / Domain Class Diagram]

### 8.1 แนวคิด Data Ownership

- ข้อมูลผู้ใช้: `users`
- ข้อมูลรายวิชา/บทเรียน: `subjects`, `chapters`
- ผลสกัดสารบัญ: `chapter_tocs`
- ชุดข้อสอบ: `quiz_sets`
- ผลการทำข้อสอบ + GAP: `exam_attempts`
- สถานะความเชี่ยวชาญ: `user_chapter_mastery`

---

## 9) รายละเอียดการทำงานของโมดูลหลัก

## 9.1 Authentication Module

กระบวนการหลัก:

1. Frontend เรียก `POST /auth/google/start`
2. Backend สร้าง `state` และ URL สำหรับ OAuth
3. Google callback กลับ `GET /auth/google/callback`
4. Backend ตรวจสอบ state, แลก token, อ่าน userinfo
5. ตรวจสอบโดเมน `@email.kmutnb.ac.th`
6. upsert ผู้ใช้ และออก access token ภายในระบบ

[ใส่รูป: OAuth Sequence Diagram]

## 9.2 Admin Module

หน้าที่หลัก:

- สร้าง subject
- แสดงรายการ subject
- อัปโหลด chapter PDF
- ลบ subject/chapter

หลัง upload ระบบจะทำงานอัตโนมัติแบบ best effort:

- extract PDF -> markdown
- build TOC
- upsert TOC ลงฐานข้อมูล

[ใส่รูป: Admin Archive Page + Upload Flow]

## 9.3 Core Exam Module

### 9.3.1 Generate Quiz

- อ่าน TOC + markdown ของ chapter
- คำนวณ difficulty plan โดยดู attempt count + mastery
- เรียก LLM สร้างข้อสอบ
- validate schema ด้วย Pydantic
- บันทึกลง `quiz_sets`

### 9.3.2 Submit & Score

- รับคำตอบจากผู้ใช้
- ตรวจ payload ให้ถูกต้อง
- ประเมินถูก/ผิดรายข้อ
- บันทึก attempt
- อัปเดต mastery profile

### 9.3.3 GAP Analysis

- อ่าน review_items จาก attempt
- เรียก LLM วิเคราะห์จุดอ่อน
- validate output
- บันทึกสถานะและผลลัพธ์ใน `exam_attempts`

[ใส่รูป: Core Exam End-to-End Sequence]

---

## 10) รายละเอียด API ของระบบ

### 10.1 Auth
- `GET /auth/google/start`
- `POST /auth/google/start`
- `GET /auth/google/callback`
- `POST /auth/logout`

### 10.2 User
- `GET /me`

### 10.3 Admin
- `GET /admin/me`
- `POST /admin/subjects`
- `GET /admin/subjects`
- `POST /admin/subjects/{subject_id}/chapters/upload`
- `GET /admin/subjects/{subject_id}/chapters`
- `DELETE /admin/subjects/{subject_id}`
- `DELETE /admin/subjects/{subject_id}/chapters/{chapter_id}`

### 10.4 Core Exam
- `POST /core/chapters/{chapter_id}/extract`
- `GET /core/chapters/{chapter_id}/toc`
- `POST /core/exam/generate/{chapter_id}`
- `GET /core/exam/sets/{chapter_id}`
- `GET /core/exam/set/{quiz_set_id}`
- `POST /core/exam/submit/{quiz_set_id}`
- `GET /core/exam/attempt/{attempt_id}`
- `GET /core/analysis/gap/{attempt_id}`
- `POST /core/analysis/gap/{attempt_id}/generate`
- `GET /core/mastery/chapter/{chapter_id}`

[ใส่รูป: Swagger/OpenAPI หน้า endpoint ทั้งระบบ]

---

## 11) แนวทางบำรุงรักษาระบบ

### 11.1 จุดแก้ไขตามงานที่พบบ่อย

- ปรับ policy ความยากข้อสอบ: `services/core_exam/api.py` (`_difficulty_plan_for_generation`)
- ปรับ prompt สร้างข้อสอบ: `services/core_exam/quiz_service.py`
- ปรับ prompt วิเคราะห์ GAP: `services/core_exam/gap_service.py`
- ปรับ schema contract: `services/core_exam/models.py`
- เพิ่ม endpoint ใหม่: `services/*/api.py` และ include ใน `apps/api/main.py`

### 11.2 ข้อควรระวัง

- token store ปัจจุบันเป็น in-memory (`services/auth/session.py`)
- restart backend แล้ว token เดิมใช้งานไม่ได้
- bootstrap schema เป็น SQL ตรง ยังไม่มี migration version

---

## 12) การทดสอบระบบและการตรวจสอบคุณภาพ

### 12.1 Manual Smoke Test ที่ควรทำทุกครั้งก่อนส่งงาน

- Login ด้วย Google สำเร็จ
- Admin สร้าง Subject และ Upload PDF ได้
- TOC ถูกสร้าง
- Generate Quiz ได้
- ทำข้อสอบและ submit ได้
- แสดง Summary และ GAP ได้

### 12.2 API Health Check

- `GET /health` ต้องได้ `{"status":"ok"...}`
- `GET /me` (หลัง login) ต้องตอบกลับ user profile

[ใส่รูป: ผลการทดสอบตาม checklist]

---

## 13) ความเสี่ยง ข้อจำกัด และข้อเสนอแนะ

### 13.1 ความเสี่ยง/ข้อจำกัดในปัจจุบัน

- Session token ยังไม่ persistent
- docker-compose สำหรับ api/web ยังเป็น skeleton command
- frontend มี inline style จำนวนมาก ทำให้ปรับธีมรวมทั้งระบบยากขึ้น

### 13.2 ข้อเสนอแนะเพื่อพัฒนาต่อ

- เปลี่ยน auth token เป็น JWT + refresh strategy
- ใช้ migration framework (Alembic)
- เพิ่ม automated test (unit/integration) ให้ครอบคลุมมากขึ้น
- แยก observability (structured logging/metrics)

---

## 14) ภาคผนวก

### Appendix A: รายการไฟล์สำคัญ

- `apps/api/main.py`
- `services/auth/api.py`
- `services/auth/session.py`
- `services/admin/api.py`
- `services/core_exam/api.py`
- `services/core_exam/quiz_service.py`
- `services/core_exam/gap_service.py`
- `packages/db_postgres/bootstrap.py`
- `apps/web/src/App.jsx`
- `apps/web/src/lib_api.js`

### Appendix B: เอกสารประกอบที่ควรแนบพร้อมคู่มือระบบ

- Architecture Diagram
- Class Diagram (Domain + Conceptual Design)
- API Screenshot (Swagger/Postman)
- Deployment/Run Evidence
- Test Evidence

[ใส่รูป: Checklist เอกสารประกอบการส่ง]

