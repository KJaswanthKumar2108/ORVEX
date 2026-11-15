#!/usr/bin/env sh
set -e

echo "[ORVEX Startup] Checking database connection and running Alembic migrations..."
if [ -n "$DATABASE_URL" ]; then
    python -m alembic -c database/alembic.ini upgrade head
    echo "[ORVEX Startup] Migrations up to date."
else
    echo "[ORVEX Startup] WARNING: DATABASE_URL not set; skipping migrations."
fi

echo "[ORVEX Startup] Launching Uvicorn server on 0.0.0.0:8000..."
exec python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000 --workers ${WEB_CONCURRENCY:-2}

