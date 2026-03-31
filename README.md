# E-Pretest

ระบบข้อสอบ Pre-test อัจฉริยะสำหรับนักศึกษา มหาวิทยาลัยเทคโนโลยีพระจอมเกล้าพระนครเหนือ (KMUTNB)

ผู้ดูแลระบบสามารถอัปโหลดเอกสาร PDF แล้วระบบจะสร้างข้อสอบปรนัย (MCQ) จากเนื้อหาโดยอัตโนมัติผ่าน LLM พร้อมระบบ Adaptive Difficulty และ GAP Analysis เพื่อวิเคราะห์จุดอ่อนของผู้เรียน

---

## Features

- **Google OAuth** — เข้าสู่ระบบด้วย Google Account ของ KMUTNB (`@email.kmutnb.ac.th`) เท่านั้น
- **Admin Upload** — อัปโหลด PDF และจัดการรายวิชา/บทเรียน
- **PDF Extraction** — แปลง PDF เป็น Markdown เพื่อใช้เป็น context
- **MCQ Generation** — สร้างข้อสอบปรนัย 5 ตัวเลือกจากเนื้อหา โดย DeepSeek LLM พร้อมอธิบาย rationale ทุกตัวเลือก
- **Adaptive Difficulty** — ปรับระดับความยากของข้อสอบตาม mastery ของผู้เรียน (Bayesian Beta model, 5 ระดับ)
- **GAP Analysis** — วิเคราะห์จุดอ่อนจากผลสอบ พร้อมคำแนะนำการทบทวน

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12, FastAPI, Uvicorn |
| Frontend | React 18, Vite, React Router |
| Database | PostgreSQL 16 (primary), MongoDB 7 (optional) |
| LLM | DeepSeek API (`deepseek-chat`) |
| PDF Processing | PyMuPDF, LangChain-PyMuPDF4LLM |
| Auth | Google OAuth 2.0 + HMAC-SHA256 state validation |
| Infrastructure | Docker, Docker Compose |

---

## Project Structure

```
E-Pretest/
├── apps/
│   ├── api/            # FastAPI entry point
│   └── web/            # React SPA
├── services/
│   ├── auth/           # Google OAuth, session management
│   ├── admin/          # Subject/chapter CRUD, PDF upload
│   ├── core_exam/      # PDF extract, quiz generation, GAP analysis
│   └── user/           # User profile
├── packages/
│   ├── contracts/      # Shared Pydantic schemas
│   ├── db_postgres/    # PostgreSQL repositories + schema bootstrap
│   ├── db_mongo/       # MongoDB adapters (skeleton)
│   └── shared/         # Config, env loader, logging
├── infra/
│   ├── env/            # .env.example
│   └── docker-compose.yml
└── outputs/            # Generated markdown, TOC, quiz files
```

---

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL 16 (หรือใช้ Docker)
- DeepSeek API Key
- Google OAuth 2.0 Client ID & Secret

### 1. Clone & Setup Environment

```bash
git clone https://github.com/<your-username>/E-Pretest.git
cd E-Pretest

cp infra/env/.env.example infra/env/.env
```

แก้ไขค่าใน `infra/env/.env`:

```env
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/google/callback
OAUTH_STATE_SECRET=<random-secret-string>

DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/epretest

DEEPSEEK_API_KEY=<your-deepseek-api-key>
```

### 2. Start Database (Docker)

```bash
docker run -d \
  --name epretest-postgres \
  -e POSTGRES_DB=epretest \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5433:5432 \
  postgres:16
```

### 3. Initialize Database Schema

```bash
python packages/db_postgres/bootstrap.py
```

### 4. Start Backend

```bash
pip install -r requirements-backend.txt

uvicorn apps.api.main:app --reload --host 0.0.0.0 --port 8000
```

API พร้อมใช้งานที่ `http://localhost:8000`
Swagger UI: `http://localhost:8000/docs`

### 5. Start Frontend

```bash
cd apps/web
npm install
npm run dev
```

Frontend พร้อมใช้งานที่ `http://localhost:5173`

---

## API Overview

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/google/start` | ขอ Google OAuth URL |
| `GET` | `/auth/google/callback` | รับ token หลัง OAuth |
| `GET` | `/me` | ข้อมูล user ปัจจุบัน |
| `POST` | `/auth/logout` | ออกจากระบบ |
| `GET` | `/admin/subjects` | รายการวิชาทั้งหมด |
| `POST` | `/admin/subjects` | สร้างวิชาใหม่ |
| `POST` | `/admin/subjects/{id}/chapters` | อัปโหลด PDF บทเรียน |
| `POST` | `/core/chapters/{id}/extract` | แปลง PDF เป็น Markdown |
| `POST` | `/core/chapters/{id}/toc/build` | สร้าง Table of Contents |
| `POST` | `/core/exam/generate/{chapter_id}` | สร้างชุดข้อสอบ (MCQ) |
| `POST` | `/core/exam/submit/{quiz_set_id}` | ส่งคำตอบและรับคะแนน |
| `GET` | `/core/exam/attempt/{attempt_id}` | ดูผลสอบย้อนหลัง |
| `POST` | `/core/analysis/gap/{attempt_id}/generate` | สร้าง GAP Analysis |
| `GET` | `/core/mastery/chapter/{chapter_id}` | ดู mastery ของบทเรียน |

---

## Adaptive Difficulty

ระบบปรับระดับความยากของข้อสอบตาม **Bayesian Beta Distribution**:

| Mastery | ระดับ | ช่วงคะแนน |
|---|---|---|
| 0–19% | Novice | Level 1–2 |
| 20–39% | Developing | Level 1–2 |
| 40–59% | Competent | Level 2–3 |
| 60–79% | Proficient | Level 3–4 |
| 80–100% | Mastered | Level 4–5 |

ระดับความยากอิงตาม Bloom's Taxonomy (Remembering → Evaluating & Synthesizing)

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth Client Secret |
| `GOOGLE_REDIRECT_URI` | Yes | OAuth callback URL |
| `OAUTH_STATE_SECRET` | Yes | Secret สำหรับ sign OAuth state |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `DEEPSEEK_API_KEY` | Yes | DeepSeek API Key |
| `DEEPSEEK_BASE_URL` | No | Default: `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | No | Default: `deepseek-chat` |
| `MONGO_URL` | No | MongoDB (optional) |

---

## License

MIT
