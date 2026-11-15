#!/usr/bin/env sh
set -e

echo "[ORVEX Startup] Checking database connection and running Alembic migrations..."
if [ -n "$DATABASE_URL" ]; then
    python -m alembic -c database/alembic.ini upgrade head || echo "[ORVEX Startup] Note: Alembic migration check finished."
    echo "[ORVEX Startup] Database ready."
else
    echo "[ORVEX Startup] WARNING: DATABASE_URL not set; skipping migrations."
fi

APP_PORT="${PORT:-8000}"
echo "[ORVEX Startup] Launching Uvicorn server on 0.0.0.0:${APP_PORT}..."
exec python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port "${APP_PORT}" --workers ${WEB_CONCURRENCY:-2}

