# DB Postgres Bootstrap

Initialize database schema:

```bash
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/epretest"
python packages/db_postgres/bootstrap.py
```

Tables created:
- users
- materials
