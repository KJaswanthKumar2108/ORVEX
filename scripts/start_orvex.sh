#!/usr/bin/env bash
# scripts/start_orvex.sh
# ORVEX Production / Development Stack Startup Script (Bash)

set -euo pipefail

DEV_MODE=false
BUILD=true

for arg in "$@"; do
    case $arg in
        --dev)
            DEV_MODE=true
            shift
            ;;
        --no-build)
            BUILD=false
            shift
            ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

echo "=========================================="
echo "         ORVEX Platform Startup           "
echo "=========================================="

if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        echo "[WARN] .env not found. Copying .env.example to .env..."
        cp .env.example .env
    else
        echo "[ERROR] Neither .env nor .env.example found." >&2
        exit 1
    fi
fi

if [ "$DEV_MODE" = true ]; then
    echo "[INFO] Starting ORVEX in DEVELOPMENT mode (docker-compose.yml)..."
    COMPOSE_FILE="docker-compose.yml"
    HEALTH_URL="http://localhost:8000/health"
else
    echo "[INFO] Starting ORVEX in PRODUCTION mode (docker-compose.prod.yml)..."
    COMPOSE_FILE="docker-compose.prod.yml"
    HEALTH_URL="http://localhost:8080/health"
fi

BUILD_FLAG=""
if [ "$BUILD" = true ]; then
    BUILD_FLAG="--build"
fi

echo "[INFO] Executing: docker compose -f ${COMPOSE_FILE} up -d ${BUILD_FLAG}"
docker compose -f "${COMPOSE_FILE}" up -d ${BUILD_FLAG}

echo "[INFO] Services launched. Monitoring health..."
MAX_RETRIES=20
RETRY_COUNT=0
HEALTHY=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    sleep 3
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if curl -s -f "${HEALTH_URL}" > /dev/null 2>&1; then
        HEALTHY=true
        break
    fi
    echo "  ... waiting for application ready (${RETRY_COUNT}/${MAX_RETRIES})"
done

echo ""
if [ "$HEALTHY" = true ]; then
    echo "=========================================="
    echo "   ORVEX Services Online & Healthy!       "
    echo "=========================================="
    if [ "$DEV_MODE" = true ]; then
        echo "Frontend:  http://localhost:5173"
        echo "Backend:   http://localhost:8000"
        echo "API Docs:  http://localhost:8000/docs"
    else
        echo "Dashboard: http://localhost:8080"
        echo "Health:    http://localhost:8080/health"
        echo "Status:    http://localhost:8080/api/v1/system/status"
    fi
else
    echo "[WARN] Application did not report healthy within timeout. Inspect logs with:"
    echo "       docker compose -f ${COMPOSE_FILE} logs -f"
fi

