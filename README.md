# E-Pretest

**E-Pretest** is an intelligent AI-powered pre-test system designed for students at King Mongkut's University of Technology North Bangkok (KMUTNB). 

The platform allows administrators to upload PDF documents, which are then automatically transformed into multiple-choice questions (MCQs) using Large Language Models (LLMs). It features an **Adaptive Difficulty** engine based on student performance and **GAP Analysis** to identify and visualize learning weaknesses.

---

## Features

- **KMUTNB Google OAuth** — Secure authentication restricted exclusively to KMUTNB accounts (`@email.kmutnb.ac.th`).
- **Admin Management** — Effortlessly upload PDFs and manage subjects, chapters, and lesson materials.
- **AI-Powered PDF Extraction** — Seamlessly converts PDF content into structured Markdown for high-quality LLM context processing.
- **Smart MCQ Generation** — Automatically generates 5-option multiple-choice questions via **DeepSeek LLM**, providing detailed rationales for every correct and incorrect answer.
- **Adaptive Difficulty Engine** — Dynamically adjusts exam difficulty based on student mastery using a **Bayesian Beta model** across 5 proficiency levels.
- **GAP Analysis** — Provides automated post-exam feedback, identifying specific knowledge gaps and offering tailored study recommendations.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.12, FastAPI, Uvicorn |
| **Frontend** | React 18, Vite, React Router |
| **Database** | PostgreSQL 16 (Primary), MongoDB 7 (Optional) |
| **LLM** | DeepSeek API (`deepseek-chat`) |
| **PDF Processing** | PyMuPDF, LangChain-PyMuPDF4LLM |
| **Auth** | Google OAuth 2.0 + HMAC-SHA256 state validation |
| **Infrastructure** | Docker, Docker Compose |

---

## Project Structure

```text
E-Pretest/
├── apps/
│   ├── api/            # FastAPI entry point & controllers
│   └── web/            # React SPA (Frontend)
├── services/
│   ├── auth/           # Google OAuth & session management
│   ├── admin/          # Subject/Chapter CRUD & PDF management
│   ├── core_exam/      # PDF extraction, quiz generation, GAP analysis
│   └── user/           # User profile & performance statistics
├── packages/
│   ├── contracts/      # Shared Pydantic schemas (Data Models)
│   ├── db_postgres/    # PostgreSQL repositories & schema bootstrap
│   ├── db_mongo/       # MongoDB adapters (skeleton)
│   └── shared/         # Config, env loader, and logging utilities
├── infra/
│   ├── env/            # .env configuration templates
│   └── docker-compose.yml
└── outputs/            # Generated Markdown, TOC, and Quiz JSON files
