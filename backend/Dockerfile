# Stage 1: Build & Dependencies
FROM python:3.11-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Stage 2: Runtime
FROM python:3.11-slim AS runner

# Create non-root system user and group
RUN groupadd -g 10001 orvex && \
    useradd -u 10001 -g orvex -s /bin/sh -m orvex

WORKDIR /app

# Copy python dependencies
COPY --from=builder /install /usr/local

# Copy application code, analytics engine, and database migrations
COPY backend /app/backend
COPY analytics /app/analytics
COPY database /app/database
COPY docker/backend_entrypoint.sh /app/entrypoint.sh

RUN chmod +x /app/entrypoint.sh && \
    chown -R orvex:orvex /app

ENV PYTHONPATH="/app:/app/backend"
ENV PYTHONUNBUFFERED="1"
ENV ENVIRONMENT="production"

USER orvex

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)" || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]

