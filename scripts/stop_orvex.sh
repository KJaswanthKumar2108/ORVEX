#!/usr/bin/env bash
# scripts/stop_orvex.sh
# ORVEX Graceful Shutdown Utility (Bash)

set -euo pipefail

DEV_MODE=false
VOLUMES=false

for arg in "$@"; do
    case $arg in
        --dev)
            DEV_MODE=true
            shift
            ;;
        -v|--volumes)
            VOLUMES=true
            shift
            ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

echo "=========================================="
echo "         ORVEX Platform Shutdown          "
echo "=========================================="

if [ "$DEV_MODE" = true ]; then
    COMPOSE_FILE="docker-compose.yml"
else
    COMPOSE_FILE="docker-compose.prod.yml"
fi

VOL_FLAG=""
if [ "$VOLUMES" = true ]; then
    VOL_FLAG="-v"
fi

echo "[INFO] Stopping services defined in ${COMPOSE_FILE}..."
docker compose -f "${COMPOSE_FILE}" down ${VOL_FLAG}

echo "[SUCCESS] Services stopped gracefully."

