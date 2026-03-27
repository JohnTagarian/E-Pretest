# E-Pretest MVP Tracker 

Scope lock (for now):
- Keep: Authen, Admin Upload, User Exam, PDF -> MCQ, GAP analysis
- Exclude: RAG, vector DB, and all non-functional requirements for this phase

## Current Priority Order

1. Auth (Google OAuth + KMUTNB domain filter)
2. Admin uploads PDF
3. Core engine extracts PDF text
4. Core engine generates MCQ from extracted text
5. User takes exam + submits answers
6. GAP analysis from exam result

## Status Board

- [ ] P0: Real Google OAuth works end-to-end
- [ ] P1: Admin upload API + file storage works
- [ ] P2: PDF text extraction service works
- [ ] P3: MCQ generation from extracted text works
- [ ] P4: User exam session + submit flow works
- [ ] P5: GAP analysis result works

## Detailed Steps (Independent as much as possible)

### Step A - Auth (P0)
- Backend:
  - Google OAuth start/callback with state validation
  - Domain filter: `@email.kmutnb.ac.th`
  - Issue app token and support `/me`, `/logout`
- Frontend:
  - Login -> callback -> profile flow
- Definition of done:
  - User can login via Google and reach `/me`
  - Non-KMUTNB email is rejected

### Step B - Admin Upload (P1)
- Backend only:
  - `POST /admin/materials/upload` (PDF only)
  - Save file to local storage path (simple mode)
  - Save metadata (filename, uploader, uploaded_at)
- Definition of done:
  - Admin uploads PDF successfully and receives material id

### Step C - PDF Extraction (P2)
- Backend only:
  - `POST /core/extract/{material_id}`
  - Extract raw text from PDF and persist extraction output
- Definition of done:
  - Extracted text can be retrieved by material id

### Step D - MCQ Generation (P3)
- Backend only:
  - `POST /core/generate-mcq/{material_id}`
  - Use extracted text to produce MCQ JSON
  - Persist quiz set
- Definition of done:
  - System returns valid MCQ schema and stores quiz

### Step E - User Exam Flow (P4)
- Backend first, frontend second:
  - Start exam from quiz set
  - Submit answers
  - Return score + explanation per question
- Definition of done:
  - User can finish an exam and get result payload

### Step F - GAP Analysis (P5)
- Backend only:
  - Analyze wrong answers by topic
  - Return weak-topic summary + suggested next focus
- Definition of done:
  - GAP analysis is shown after exam submission

## Simple API Set (MVP)

- Auth:
  - `POST /auth/google/start`
  - `GET /auth/google/callback`
  - `GET /me`
  - `POST /auth/logout`

- Admin:
  - `POST /admin/materials/upload`

- Core:
  - `POST /core/extract/{material_id}`
  - `POST /core/generate-mcq/{material_id}`

- Exam:
  - `POST /exam/start/{quiz_id}`
  - `POST /exam/submit/{attempt_id}`

- Analysis:
  - `GET /analysis/gap/{attempt_id}`

## Rule for this MVP phase

- Prefer local file storage over cloud
- Prefer in-memory/simple persistence over full DB complexity if not blocking core flow
- Keep each step deployable and testable in isolation
