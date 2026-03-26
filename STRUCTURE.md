# E-Pretest Structure (Skeleton - Step 1)

This is folder skeleton only. Implementation will be added step-by-step.

- apps/api: FastAPI app entrypoints
- apps/web: React app
- services/core_exam: TOC, quiz generation, adaptive logic
- services/user: user profile domain
- services/auth: Google OAuth + token/session
- services/admin: admin use-cases (user role management)
- packages/contracts: request/response schemas
- packages/db_postgres: Postgres adapters/models
- packages/db_mongo: Mongo adapters/models
- packages/shared: config, logging, security shared libs
- infra: docker-compose and env templates
- tests: unit/integration/e2e

Note: Redis intentionally removed to keep v1 simple.
