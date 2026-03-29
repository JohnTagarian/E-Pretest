# E-Pretest Dev Quick Manual

Version: 1.0  
Last updated: 2026-03-30  
Audience: Developers who need to run, debug, and maintain the project quickly

---

## 1) Quick Command Index

Use this section first when you need to do something fast.

| Task | Command |
|---|---|
| Create Python venv | `python -m venv .venv` |
| Activate venv | `source .venv/bin/activate` |
| Install backend deps | `pip install -r requirements-backend.txt` |
| Install frontend deps | `cd apps/web && npm install` |
| Start PostgreSQL (Docker) | `docker run --name epretest-pg -e POSTGRES_DB=epretest -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -p 5433:5432 -d postgres:16` |
| Initialize DB schema | `python packages/db_postgres/bootstrap.py` |
| Run backend API | `uvicorn apps.api.main:app --reload --host 0.0.0.0 --port 8000` |
| Run frontend web | `cd apps/web && npm run dev` |
| Build frontend | `cd apps/web && npm run build` |
| Health check | `curl http://127.0.0.1:8000/health` |
| Stop PostgreSQL container | `docker stop epretest-pg` |
| Start PostgreSQL container | `docker start epretest-pg` |
| View PostgreSQL logs | `docker logs -f epretest-pg` |
| Drop and recreate DB container | `docker rm -f epretest-pg` then run start command again |

[ใส่รูป: Terminal split screen (API + Web + DB running)]

---

## 2) One-Time Setup (New Machine)

### 2.1 Backend

```bash
cd /home/kantinan/programming/E-Pretest
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-backend.txt
```

### 2.2 Frontend

```bash
cd /home/kantinan/programming/E-Pretest/apps/web
npm install
```

### 2.3 Environment file

Copy and fill values from:
- `infra/env/.env.example`
- actual local file: `infra/env/.env`

Required keys:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `OAUTH_STATE_SECRET`
- `DATABASE_URL` (or `POSTGRES_URL`)
- `DEEPSEEK_API_KEY`

[ใส่รูป: Example `.env` filled]

### 2.4 Database bootstrap

```bash
cd /home/kantinan/programming/E-Pretest
python packages/db_postgres/bootstrap.py
```

---

## 3) Daily Run Workflow

### 3.1 Start DB

```bash
docker start epretest-pg
```

If container does not exist, run create command from Quick Command Index.

### 3.2 Start API

```bash
cd /home/kantinan/programming/E-Pretest
source .venv/bin/activate
uvicorn apps.api.main:app --reload --host 0.0.0.0 --port 8000
```

### 3.3 Start Web

```bash
cd /home/kantinan/programming/E-Pretest/apps/web
npm run dev
```

### 3.4 Verify base health

```bash
curl http://127.0.0.1:8000/health
```

Expected:
- `{"status":"ok","mode":"skeleton"}` (or current project equivalent)

---

## 4) System Map (Where to Edit)

### API entry
- `apps/api/main.py` -> includes all routers and CORS

### Auth
- `services/auth/api.py` -> OAuth start/callback/logout
- `services/auth/session.py` -> in-memory token store and guards

### Admin
- `services/admin/api.py` -> subject/chapter CRUD, PDF upload

### Core exam
- `services/core_exam/api.py` -> extract, toc, generate quiz, submit, gap, mastery
- `services/core_exam/quiz_service.py` -> LLM quiz generation + parsing
- `services/core_exam/gap_service.py` -> LLM gap generation + parsing
- `services/core_exam/toc_service.py` -> TOC building logic
- `services/core_exam/extract_service.py` -> PDF -> Markdown extraction

### Database layer
- `packages/db_postgres/bootstrap.py` -> schema DDL
- `packages/db_postgres/*_repo.py` -> data access functions

### Frontend
- `apps/web/src/App.jsx` -> route map
- `apps/web/src/lib_api.js` -> frontend API facade
- `apps/web/src/lib_auth.js` -> token helper
- `apps/web/src/pages/*` -> actual pages/flows

---

## 5) Core Runtime Flows (Maintenance View)

## 5.1 OAuth flow

1. Frontend requests `/auth/google/start`  
2. Redirect to Google  
3. Callback `/auth/google/callback`  
4. Backend validates state + exchanges token + domain check  
5. User persisted and app token returned

Important:
- Allowed domain: `@email.kmutnb.ac.th`
- session token store is **in-memory**

## 5.2 Admin upload flow

1. Upload chapter PDF  
2. Save file to `data/uploads/...`  
3. Auto extract to markdown in `outputs/markdown/...`  
4. Build TOC and upsert into `chapter_tocs`

## 5.3 Quiz generation flow

1. Load chapter TOC + mastery + attempt count  
2. `_difficulty_plan_for_generation(...)` decides target levels  
3. LLM generates questions  
4. Pydantic validates JSON schema  
5. Save to `quiz_sets`

## 5.4 Submit + gap flow

1. Submit answers to `/core/exam/submit/{quiz_set_id}`  
2. Score + review items + save `exam_attempts`  
3. Optional gap generation endpoint writes `gap_markdown`

[ใส่รูป: Sequence summary diagram (Auth, Upload, Quiz, GAP)]

---

## 6) Most Common Change Tasks

### A) Change difficulty strategy
- File: `services/core_exam/api.py`
- Function: `_difficulty_plan_for_generation(...)`

### B) Change quiz prompt
- File: `services/core_exam/quiz_service.py`
- Function: `_build_messages(...)`

### C) Change gap output style
- File: `services/core_exam/gap_service.py`
- Function: `build_gap_markdown(...)`

### D) Change API response contract
- File: `services/core_exam/models.py`

### E) Add new backend endpoint
1. Add route in `services/<module>/api.py`
2. Include router in `apps/api/main.py` (if new module)
3. Update frontend `lib_api.js` caller/page

### F) Add new DB field/table
1. Update `packages/db_postgres/bootstrap.py`
2. Update repository functions
3. Re-bootstrap on clean DB (or add migration process)

---

## 7) Smoke Test Checklist (Fast)

Do these after any major change:

- [ ] Login via Google works
- [ ] `/me` returns user profile
- [ ] Admin can create subject
- [ ] Admin can upload chapter PDF
- [ ] TOC appears for uploaded chapter
- [ ] Generate quiz success
- [ ] Start quiz, submit, summary shown
- [ ] Generate/View gap works

[ใส่รูป: Smoke test evidence screenshots]

---

## 8) Troubleshooting Cheatsheet

## 8.1 Missing `DATABASE_URL`
Symptom:
- bootstrap fails with `DATABASE_URL is not set`

Fix:
- load env correctly and verify:

```bash
python -c "import os; print(os.getenv('DATABASE_URL'))"
```

## 8.2 `Invalid or expired OAuth state`
Fix:
- restart login flow
- verify `OAUTH_STATE_SECRET` consistency

## 8.3 `Google token exchange failed: invalid_grant`
Fix:
- ensure `GOOGLE_REDIRECT_URI` exactly matches Google Console
- do not reuse old callback code

## 8.4 `Failed to persist user`
Fix:
- DB not reachable or schema missing
- start postgres and run bootstrap

## 8.5 Quiz/GAP generation fails
Fix:
- check `DEEPSEEK_API_KEY`
- inspect API logs for LLM response validation errors

---

## 9) Known Limitations (Current)

- Auth token store is in-memory (`services/auth/session.py`) 
- `infra/docker-compose.yml` api/web services are skeleton commands
- No formal DB migration versioning yet
- Frontend has many inline styles (design iteration speed priority)

---

## 10) Handover Quick List

Before handover to next developer:
- [ ] `SYSTEM_MANUAL.md` and this quick manual are updated
- [ ] `.env.example` reflects all required keys
- [ ] `bootstrap.py` schema changes documented
- [ ] smoke test evidence captured
- [ ] key flows demo-ready (auth, upload, generate, submit, gap)

[ใส่รูป: Handover completion checklist]

---

## Appendix: Key Paths

- API entry: `apps/api/main.py`
- Auth: `services/auth/api.py`, `services/auth/session.py`
- Admin: `services/admin/api.py`
- Core exam: `services/core_exam/api.py`
- DB schema: `packages/db_postgres/bootstrap.py`
- Frontend routes: `apps/web/src/App.jsx`

