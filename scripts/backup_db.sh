#!/usr/bin/env bash
# scripts/backup_db.sh
# ORVEX Database Backup Utility (Bash)
# Backs up the PostgreSQL/TimescaleDB database to a timestamped SQL file.

set -euo pipefail

OUTPUT_DIR="${1:-backups}"
DB_USER="${POSTGRES_USER:-orvex}"
DB_NAME="${POSTGRES_DB:-orvex}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${SCRIPT_DIR}/../${OUTPUT_DIR}"
mkdir -p "${BACKUP_DIR}"

BACKUP_FILE="${BACKUP_DIR}/orvex_backup_${TIMESTAMP}.sql"

echo "=========================================="
echo "   ORVEX Database Backup Utility (Bash)   "
echo "=========================================="
echo "Target: ${BACKUP_FILE}"

CONTAINER_NAME=""
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "orvex-database-prod"; then
    CONTAINER_NAME="orvex-database-prod"
elif docker ps --format '{{.Names}}' 2>/dev/null | grep -q "orvex-database-1"; then
    CONTAINER_NAME="orvex-database-1"
fi

if [ -n "${CONTAINER_NAME}" ]; then
    echo "[INFO] Using Docker container: ${CONTAINER_NAME}"
    docker exec "${CONTAINER_NAME}" pg_dump -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists > "${BACKUP_FILE}"
elif command -v pg_dump >/dev/null 2>&1; then
    echo "[INFO] Using host pg_dump..."
    PGPASSWORD="${POSTGRES_PASSWORD:-replace-with-a-local-secret}" \
    pg_dump -h "${POSTGRES_HOST:-localhost}" -p "${POSTGRES_PORT:-5433}" -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists > "${BACKUP_FILE}"
else
    echo "[ERROR] Neither Docker container nor host pg_dump utility was found." >&2
    exit 1
fi

if [ -s "${BACKUP_FILE}" ]; then
    SIZE=$(stat -c%s "${BACKUP_FILE}" 2>/dev/null || wc -c < "${BACKUP_FILE}")
    echo "[SUCCESS] Backup created successfully: ${BACKUP_FILE} (${SIZE} bytes)"
    exit 0
else
    echo "[ERROR] Backup failed or generated an empty file." >&2
    exit 1
fi

