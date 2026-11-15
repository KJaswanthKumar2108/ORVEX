# ==============================================================================
# ORVEX Unified Single-Service Multi-Stage Dockerfile
# Builds the Vite/React frontend and FastAPI backend into a single container image.
# ==============================================================================

# --- Stage 1: Build React Frontend ---
FROM node:20-alpine AS frontend-builder
WORKDIR /build/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# --- Stage 2: Install Python Backend Dependencies ---
FROM python:3.11-slim AS backend-builder
WORKDIR /build/backend

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# --- Stage 3: Unified Runtime Container ---
FROM python:3.11-slim AS runner

# Create non-root system user
RUN groupadd -g 10001 orvex && \
    useradd -u 10001 -g orvex -s /bin/sh -m orvex

WORKDIR /app

# Copy Python packages from builder
COPY --from=backend-builder /install /usr/local

# Copy application directories
COPY backend /app/backend
COPY analytics /app/analytics
COPY database /app/database
COPY hardware /app/hardware
COPY simulator /app/simulator

# Copy built frontend assets
COPY --from=frontend-builder /build/frontend/dist /app/frontend/dist

# Entrypoint script
COPY docker/backend_entrypoint.sh /app/entrypoint.sh

RUN chmod +x /app/entrypoint.sh && \
    chown -R orvex:orvex /app

ENV PYTHONPATH="/app:/app/backend"
ENV PYTHONUNBUFFERED="1"
ENV ENVIRONMENT="production"
ENV FRONTEND_DIST_DIR="/app/frontend/dist"
ENV PORT="8000"

USER orvex

EXPOSE 8000 10000

HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request, os; port = os.environ.get('PORT', '8000'); urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=3)" || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
