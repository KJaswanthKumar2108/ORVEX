from __future__ import annotations

import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import SQLAlchemyError

from app.api.routes import (
    alerts,
    health,
    insights,
    machine_health,
    machines,
    reports,
    system,
    telemetry,
    wastage_events,
)
from app.core.config import get_settings
from app.db.base import Base
from app.db.session import create_database_engine, create_session_factory
from app.gateway.mqtt_client import MqttGateway
from app.middleware.security import (
    ContentLengthLimitMiddleware,
    RateLimitMiddleware,
    SecurityHeadersMiddleware,
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    engine = None
    application.state.session_factory = None
    application.state.mqtt_gateway = None

    if settings.database_url:
        engine = create_database_engine(settings.database_url)
        Base.metadata.create_all(bind=engine, checkfirst=True)
        application.state.session_factory = create_session_factory(engine)

    # Initialize and start the MQTT hardware gateway if enabled and database is available
    if settings.mqtt_enabled and application.state.session_factory is not None:
        gateway = MqttGateway(
            session_factory=application.state.session_factory,
            settings=settings,
        )
        application.state.mqtt_gateway = gateway
        try:
            gateway.start()
        except Exception as err:
            logger.warning("Error starting MQTT gateway at startup: %s", err)

    try:
        yield
    finally:
        if application.state.mqtt_gateway is not None:
            try:
                application.state.mqtt_gateway.stop()
            except Exception as err:
                logger.warning("Error stopping MQTT gateway at shutdown: %s", err)

        if engine is not None:
            engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title="ORVEX API",
        version=settings.app_version,
        lifespan=lifespan,
    )

    # 1. Defense-in-depth HTTP security headers (nosniff, DENY, CSP, XSS)
    application.add_middleware(
        SecurityHeadersMiddleware,
        environment=settings.environment,
    )

    # 2. Maximum payload size protection (HTTP 413) to prevent memory exhaustion
    application.add_middleware(
        ContentLengthLimitMiddleware,
        max_bytes=settings.max_request_body_bytes,
    )

    # 3. Client IP rate limiting (HTTP 429) with monitoring exemption
    application.add_middleware(
        RateLimitMiddleware,
        enabled=settings.rate_limit_enabled,
        requests_per_minute=settings.rate_limit_per_minute,
        exempt_paths=(
            "/health",
            "/api/v1/system/status",
            "/api/v1/system/readiness",
            "/api/v1/system/liveness",
        ),
    )

    # 4. Strict, configurable CORS policy
    allowed_origins = list(settings.cors_origins)
    allow_all = "*" in allowed_origins
    application.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins if allowed_origins else ["*"],
        allow_credentials=not allow_all,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        allow_headers=["*"],
    )

    # Core Routes
    application.include_router(health.router)
    application.include_router(system.router, prefix="/api/v1")
    application.include_router(telemetry.router, prefix="/api/v1")
    application.include_router(machines.router, prefix="/api/v1")
    application.include_router(wastage_events.router, prefix="/api/v1")
    application.include_router(alerts.router, prefix="/api/v1")
    application.include_router(reports.router, prefix="/api/v1")
    application.include_router(insights.router, prefix="/api/v1")
    application.include_router(machine_health.router, prefix="/api/v1")

    @application.exception_handler(SQLAlchemyError)
    async def database_error_handler(_request: Request, exception: SQLAlchemyError) -> JSONResponse:
        logger.error("Database operation failed: %s", exception, exc_info=True)
        return JSONResponse(status_code=503, content={"detail": "Database operation failed."})

    @application.exception_handler(Exception)
    async def unexpected_error_handler(_request: Request, exception: Exception) -> JSONResponse:
        if isinstance(exception, HTTPException):
            return JSONResponse(status_code=exception.status_code, content={"detail": exception.detail})
        logger.error("Unhandled application exception: %s", exception, exc_info=True)
        detail_msg = str(exception) if settings.environment != "production" else "Internal server error."
        return JSONResponse(status_code=500, content={"detail": detail_msg})

    # Frontend SPA Integration (serves frontend/dist when available for single-service deployment)
    frontend_dist = os.environ.get(
        "FRONTEND_DIST_DIR",
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")),
    )
    if os.path.exists(frontend_dist):
        assets_dir = os.path.join(frontend_dist, "assets")
        if os.path.exists(assets_dir):
            application.mount("/assets", StaticFiles(directory=assets_dir), name="static_assets")

        index_file = os.path.join(frontend_dist, "index.html")

        @application.get("/", include_in_schema=False)
        async def serve_root() -> FileResponse:
            if os.path.isfile(index_file):
                return FileResponse(index_file)
            raise HTTPException(status_code=404, detail="Frontend index.html not found.")

        @application.get("/{full_path:path}", include_in_schema=False)
        async def serve_spa_frontend(full_path: str) -> FileResponse:
            if (
                full_path.startswith("api/")
                or full_path in ("health", "docs", "redoc", "openapi.json")
            ):
                raise HTTPException(status_code=404, detail="Not Found")
            file_path = os.path.join(frontend_dist, full_path)
            if os.path.isfile(file_path):
                return FileResponse(file_path)
            if os.path.isfile(index_file):
                return FileResponse(index_file)
            raise HTTPException(status_code=404, detail="Frontend index.html not found.")

    return application


app = create_app()
