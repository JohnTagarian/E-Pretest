# E-Pretest System Manual (Developer Maintenance Guide)

Version: 1.0  
Last updated: 2026-03-30  
Audience: Backend Developer, Frontend Developer, TA/Project Maintainer

[ใส่รูป: หน้าปกคู่มือระบบ]

---

## 1. Objective of This Manual

เอกสารนี้เป็นคู่มือเชิงเทคนิคสำหรับทีมพัฒนา เพื่อให้สามารถ:
- ติดตั้งระบบจากศูนย์ได้
- เข้าใจโครงสร้างโค้ดและการไหลของข้อมูล
- แก้ไขฟีเจอร์/บั๊กได้โดยไม่กระทบส่วนอื่น
- ตรวจสอบปัญหาและดูแลระบบต่อได้ในระยะยาว

ขอบเขตคู่มือนี้ครอบคลุมทั้ง Frontend, Backend, Database และ integration กับ Google OAuth + LLM

---

## 2. System Overview

E-Pretest เป็นระบบ Client-Server โดยมี Backend เดียวแบบ Modular Monolith

- Client: React (Vite)
- Server: FastAPI
- Database: PostgreSQL
- External Services:
  - Google OAuth (Authentication)
  - DeepSeek API (Quiz generation / GAP analysis)

[ใส่รูป: High-level Architecture Diagram (Client-Server + Modular Monolith)]

### 2.1 Current Architectural Style

- Client-Server
- Modular Monolith (backend เดียว แต่แยก module ชัดเจน)
- Layered-ish structure (API Controller -> Service Logic -> Repository -> PostgreSQL)

---

## 3. Tech Stack

### 3.1 Backend
- Python 3.12+
- FastAPI
- Uvicorn
- Psycopg3
- LangChain + langchain-openai

Dependency file: `requirements-backend.txt`

### 3.2 Frontend
- React 18
- React Router
- Vite
- react-markdown + remark-gfm

Frontend package file: `apps/web/package.json`

### 3.3 Infrastructure
- PostgreSQL 16
- Docker Compose (มี skeleton service configuration)

---

## 4. Project Structure (What to Edit Where)

[ใส่รูป: โครงสร้างโฟลเดอร์ใน IDE]

- `apps/api/main.py`  
  จุดเข้า FastAPI, include router, CORS

- `services/auth`  
  Google OAuth flow, token/session check

- `services/admin`  
  Subject/Chapter management + upload PDF + auto extract/toc

- `services/core_exam`  
  TOC, quiz generation, submit/score, GAP, mastery

- `services/user`  
  endpoint `/me`

- `packages/db_postgres`  
  repositories สำหรับ DB access + bootstrap schema

- `apps/web/src/pages`  
  หน้า UI หลักทั้งหมด

- `apps/web/src/lib_api.js`  
  API facade สำหรับ frontend

- `apps/web/src/lib_auth.js`  
  token storage helper (localStorage)

- `infra/env/.env.example`  
  ตัวอย่าง environment variables

---

## 5. Environment Variables

ไฟล์อ้างอิง: `infra/env/.env.example`

ค่าหลักที่ต้องตั้ง:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` (default: `http://localhost:8000/auth/google/callback`)
- `OAUTH_STATE_SECRET`
- `DATABASE_URL` (หรือ `POSTGRES_URL`)
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL`
- `DEEPSEEK_MODEL`

[ใส่รูป: ตัวอย่างไฟล์ .env ที่ตั้งค่าครบ]

### 5.1 Important Note

ระบบ backend จะ error ทันทีถ้าไม่มี key สำคัญ เช่น:
- `DEEPSEEK_API_KEY` (ตอน generate quiz / gap)
- `GOOGLE_*` (ตอน auth flow)
- `DATABASE_URL` (ตอนเชื่อม DB)

---

## 6. Local Setup Guide (From Scratch)

### 6.1 Backend Setup

```bash
cd /home/kantinan/programming/E-Pretest
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-backend.txt
```

### 6.2 Frontend Setup

```bash
cd /home/kantinan/programming/E-Pretest/apps/web
npm install
```

### 6.3 Start PostgreSQL (recommended via Docker)

```bash
docker run --name epretest-pg \
  -e POSTGRES_DB=epretest \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5433:5432 -d postgres:16
```

### 6.4 Initialize DB Schema

```bash
cd /home/kantinan/programming/E-Pretest
python packages/db_postgres/bootstrap.py
```

### 6.5 Run API

```bash
cd /home/kantinan/programming/E-Pretest
uvicorn apps.api.main:app --reload --host 0.0.0.0 --port 8000
```

### 6.6 Run Web

```bash
cd /home/kantinan/programming/E-Pretest/apps/web
npm run dev
```

[ใส่รูป: Terminal ที่รัน API + Web พร้อมกัน]

---

## 7. Database Schema Reference

Schema ถูกสร้างจาก `packages/db_postgres/bootstrap.py`

ตารางหลัก:
- `users`
- `materials`
- `subjects`
- `chapters`
- `chapter_tocs`
- `quiz_sets`
- `exam_attempts`
- `user_chapter_mastery`

[ใส่รูป: ER/Class Diagram ของระบบ]

### 7.1 Data Ownership (Practical)

- User/Auth profile: `users`
- Subject/Chapter: `subjects`, `chapters`
- TOC: `chapter_tocs`
- Generated quiz: `quiz_sets.questions_json`
- Submission + result + gap: `exam_attempts`
- Adaptive state: `user_chapter_mastery`

---

## 8. API Modules and Endpoints

### 8.1 Auth (`/auth`)
- `GET /auth/google/start`
- `POST /auth/google/start`
- `GET /auth/google/callback`
- `POST /auth/logout`

### 8.2 User
- `GET /me`

### 8.3 Admin (`/admin`)
- `GET /admin/me`
- `POST /admin/subjects`
- `GET /admin/subjects`
- `POST /admin/subjects/{subject_id}/chapters/upload`
- `GET /admin/subjects/{subject_id}/chapters`
- `DELETE /admin/subjects/{subject_id}`
- `DELETE /admin/subjects/{subject_id}/chapters/{chapter_id}`

### 8.4 Core Exam (`/core`)
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

[ใส่รูป: API collection screenshot (Postman/Swagger)]

---

## 9. Main Business Flows

## 9.1 OAuth Login Flow

1) Frontend กด Login with Google  
2) เรียก `POST /auth/google/start` เพื่อได้ auth URL + state  
3) Browser redirect ไป Google  
4) Google callback เข้า `GET /auth/google/callback`  
5) Backend verify state + exchange token + fetch userinfo + validate domain  
6) Backend upsert user และออก app token  
7) Frontend เก็บ token ใน localStorage (`epretest_access_token`)

[ใส่รูป: Sequence OAuth Flow]

## 9.2 Admin Upload -> Extract -> TOC (Auto)

1) Admin upload chapter PDF  
2) สร้าง chapter record  
3) Auto extract PDF -> markdown (`outputs/markdown/...`)  
4) Build TOC from markdown  
5) Upsert TOC into `chapter_tocs`

[ใส่รูป: Sequence Upload & Auto Extract/TOC]

## 9.3 Generate Quiz Flow

1) User เปิด chapter exam entry  
2) Backend load TOC + mastery + attempt count  
3) ระบบวางแผน difficulty (`_difficulty_plan_for_generation`)  
4) อ่าน markdown context  
5) เรียก LLM สร้างข้อสอบ  
6) Validate schema ด้วย Pydantic  
7) Save ลง `quiz_sets`

[ใส่รูป: Sequence Generate Quiz]

## 9.4 Submit -> Score -> Mastery Update

1) Frontend submit answers  
2) Backend validate payload  
3) grade ทุกข้อ + build review items  
4) save attempt ลง `exam_attempts`  
5) update mastery จาก graded items

[ใส่รูป: Sequence Submit and Mastery Update]

## 9.5 GAP Analysis Flow

1) User กด Generate GAP  
2) backend mark status `generating`  
3) ส่ง review items เข้า LLM  
4) parse + validate markdown output  
5) save gap result (`ready`) ใน `exam_attempts`

[ใส่รูป: Sequence GAP Analysis]

---

## 10. Frontend Route Map

ไฟล์อ้างอิง: `apps/web/src/App.jsx`

เส้นทางหลัก:
- `/login`
- `/auth/callback`
- `/subjects`
- `/chapter/:chapterId/exam`
- `/quiz/:quizSetId`
- `/summarize_test`
- `/archive`
- `/me`

[ใส่รูป: Route map / page flow]

---

## 11. Security and Access Control

### 11.1 Auth Guard
- Frontend: `ProtectedRoute` เช็ค token จาก localStorage
- Backend: `get_current_user` และ `get_admin_user`

### 11.2 Domain Restriction
- อนุญาตเฉพาะ email ที่ลงท้าย `@email.kmutnb.ac.th`

### 11.3 Current Limitation (Must Know)
- token/session store เป็น in-memory (`_token_store`)
- หาก backend restart token เดิมจะใช้ไม่ได้
- ยังไม่ใช่ JWT + persistent session

[ใส่รูป: Unauthorized / forbidden behavior example]

---

## 12. Maintenance Playbook (Where to Change)

### 12.1 เปลี่ยน Policy ความยากข้อสอบ
แก้ที่: `services/core_exam/api.py` ใน `_difficulty_plan_for_generation(...)`

### 12.2 เปลี่ยน Prompt LLM (Quiz)
แก้ที่: `services/core_exam/quiz_service.py` ใน `_build_messages(...)`

### 12.3 เปลี่ยน Prompt LLM (GAP)
แก้ที่: `services/core_exam/gap_service.py` ใน `build_gap_markdown(...)`

### 12.4 เปลี่ยน Schema Quiz/GAP
แก้ที่: `services/core_exam/models.py`

### 12.5 เพิ่ม endpoint ใหม่
แก้ที่:
- router: `services/*/api.py`
- include router: `apps/api/main.py`

### 12.6 เปลี่ยน DB schema
แก้ที่: `packages/db_postgres/bootstrap.py`  
แล้ว rerun bootstrap (ระวัง production data)

---

## 13. Common Troubleshooting

## 13.1 `Missing DEEPSEEK_API_KEY`
- สาเหตุ: ไม่มี env key
- วิธีแก้: export หรือใส่ใน `.env`

## 13.2 `Invalid or expired OAuth state`
- สาเหตุ: callback ล่าช้า/state ไม่ตรง/secret เปลี่ยน
- วิธีแก้: เริ่ม login flow ใหม่ และเช็ค `OAUTH_STATE_SECRET`

## 13.3 `Google token exchange failed: invalid_grant`
- สาเหตุ: redirect URI mismatch หรือ code ถูกใช้ซ้ำ
- วิธีแก้: เช็ค `GOOGLE_REDIRECT_URI` ให้ตรง Google Console

## 13.4 `Failed to persist user`
- สาเหตุ: DB ไม่พร้อมหรือ `DATABASE_URL` ไม่ถูก
- วิธีแก้: เช็ค DB + bootstrap schema

## 13.5 Frontend เปิดแล้วหน้าโล่ง
- เช็ค console และ route config ใน `App.jsx`
- เช็ค token ใน localStorage

[ใส่รูป: ตัวอย่าง error ที่พบบ่อยและวิธีแก้]

---

## 14. Testing Guide (Minimum)

### 14.1 Manual smoke checklist
- Login ผ่าน Google
- Admin สร้าง subject
- Upload PDF chapter
- TOC ถูกสร้าง
- Generate quiz สำเร็จ
- ทำข้อสอบ + submit
- ดู summary และ generate/view GAP

### 14.2 API sanity checklist
- `/health` = ok
- `/me` หลัง login ต้องผ่าน
- `/core/exam/sets/{chapter_id}` คืน list ได้

[ใส่รูป: Test evidence checklist screenshot]

---

## 15. Deployment Notes

### 15.1 Current docker-compose status
ไฟล์ `infra/docker-compose.yml` ตอนนี้เป็น skeleton สำหรับ api/web (command เป็น sleep)  
ดังนั้น production deployment ต้องทำ Dockerfile จริงเพิ่ม

### 15.2 Suggested production hardening
- เปลี่ยน token store เป็น persistent session/JWT
- แยก env ต่อ environment (dev/staging/prod)
- เพิ่ม central logging + monitoring
- เพิ่ม migration tool (Alembic) แทน bootstrap แบบยิง SQL ตรง

---

## 16. Known Technical Debt

- auth session ยังเป็น in-memory
- migration strategy ยังไม่เป็น versioned migration
- บางส่วนใช้ local file system path ตรง
- frontend ยังมี inline styles จำนวนมาก

---

## 17. Handover Checklist (For New Developer)

- อ่านเอกสารนี้ + Architecture diagram + Class diagram
- setup local สำเร็จตาม Section 6
- รัน flow หลักครบตาม Section 14
- เข้าใจจุดแก้ policy ที่ Section 12
- อ่าน risk/limitation ที่ Section 11, 16

[ใส่รูป: Handover checklist signed-off]

---

## Appendix A: Important Files Quick Index

- API entry: `apps/api/main.py`
- Auth: `services/auth/api.py`, `services/auth/session.py`
- Admin: `services/admin/api.py`
- Core Exam: `services/core_exam/api.py`
- Quiz LLM: `services/core_exam/quiz_service.py`
- GAP LLM: `services/core_exam/gap_service.py`
- DB bootstrap: `packages/db_postgres/bootstrap.py`
- DB repos: `packages/db_postgres/*_repo.py`
- Web routes: `apps/web/src/App.jsx`
- Web API facade: `apps/web/src/lib_api.js`

