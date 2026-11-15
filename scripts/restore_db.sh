#!/usr/bin/env bash
# scripts/restore_db.sh
# ORVEX Database Restore Utility (Bash)
# Restores the PostgreSQL/TimescaleDB database from a specified SQL backup file.

set -euo pipefail

if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <path-to-backup.sql>" >&2
    exit 1
fi

BACKUP_FILE="$1"
DB_USER="${POSTGRES_USER:-orvex}"
DB_NAME="${POSTGRES_DB:-orvex}"

if [ ! -f "${BACKUP_FILE}" ]; then
    echo "[ERROR] Backup file not found: ${BACKUP_FILE}" >&2
    exit 1
fi

echo "=========================================="
echo "   ORVEX Database Restore Utility (Bash)  "
echo "=========================================="
echo "Restoring from: ${BACKUP_FILE}"

CONTAINER_NAME=""
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "orvex-database-prod"; then
    CONTAINER_NAME="orvex-database-prod"
elif docker ps --format '{{.Names}}' 2>/dev/null | grep -q "orvex-database-1"; then
    CONTAINER_NAME="orvex-database-1"
fi

if [ -n "${CONTAINER_NAME}" ]; then
    echo "[INFO] Restoring via Docker container: ${CONTAINER_NAME}"
    docker exec -i "${CONTAINER_NAME}" psql -U "${DB_USER}" -d "${DB_NAME}" -q < "${BACKUP_FILE}"
elif command -v psql >/dev/null 2>&1; then
    echo "[INFO] Using host psql..."
    PGPASSWORD="${POSTGRES_PASSWORD:-replace-with-a-local-secret}" \
    psql -h "${POSTGRES_HOST:-localhost}" -p "${POSTGRES_PORT:-5433}" -U "${DB_USER}" -d "${DB_NAME}" -q < "${BACKUP_FILE}"
else
    echo "[ERROR] Neither Docker container nor host psql utility was found." >&2
    exit 1
fi

echo "[SUCCESS] Database restoration completed successfully."

