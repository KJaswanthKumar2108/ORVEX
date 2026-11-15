#!/usr/bin/env bash
# scripts/migrate_db.sh
# ORVEX Database Migration Utility (Bash)
# Applies pending Alembic database migrations.

set -euo pipefail

TARGET="${1:-head}"

echo "=========================================="
echo "   ORVEX Database Migration Runner (Bash) "
echo "=========================================="
echo "Applying migrations up to target: ${TARGET}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ALEMBIC_INI="${ROOT_DIR}/database/alembic.ini"

if [ ! -f "${ALEMBIC_INI}" ]; then
    echo "[ERROR] Could not find alembic.ini at: ${ALEMBIC_INI}" >&2
    exit 1
fi

python3 -m alembic -c "${ALEMBIC_INI}" upgrade "${TARGET}" || python -m alembic -c "${ALEMBIC_INI}" upgrade "${TARGET}"

echo "[SUCCESS] Database migrations applied successfully."

