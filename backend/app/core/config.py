from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[3]


def redact_url(url: str | None) -> str:
    """Masks sensitive credentials in database connection URLs for safe logging."""
    if not url:
        return "not-configured"
    # Matches scheme://user:password@host:port/dbname
    return re.sub(r"://([^:@]+):([^@]+)@", r"://\1:***@", url)


@dataclass(frozen=True, slots=True)
class Settings:
    database_url: str | None
    mqtt_enabled: bool
    mqtt_host: str
    mqtt_port: int
    mqtt_username: str | None
    mqtt_password: str | None
    mqtt_topic_prefix: str
    mqtt_client_id: str
    mqtt_keepalive: int
    mqtt_reconnect_interval_seconds: float
    mqtt_tls_enabled: bool
    mqtt_tls_ca_cert: str | None
    mqtt_max_payload_bytes: int
    # Stage 8B Security & Production fields (with default values for backward-compatibility)
    environment: str = "development"
    cors_origins: tuple[str, ...] = (
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    )
    max_request_body_bytes: int = 2_097_152  # 2 MB payload protection
    rate_limit_enabled: bool = True
    rate_limit_per_minute: int = 600
    app_version: str = "1.0.0"


def get_settings() -> Settings:
    load_dotenv(PROJECT_ROOT / ".env", override=False)
    database_url = os.environ.get("DATABASE_URL") or None

    mqtt_enabled_str = os.environ.get("MQTT_ENABLED", "true").strip().lower()
    mqtt_enabled = mqtt_enabled_str not in {"false", "0", "no", "off", "disable", "disabled"}

    mqtt_username = os.environ.get("MQTT_USERNAME") or None
    if mqtt_username == "":
        mqtt_username = None

    mqtt_password = os.environ.get("MQTT_PASSWORD") or None
    if mqtt_password == "":
        mqtt_password = None

    mqtt_tls_enabled_str = os.environ.get("MQTT_TLS_ENABLED", "false").strip().lower()
    mqtt_tls_enabled = mqtt_tls_enabled_str in {"true", "1", "yes", "on", "enable", "enabled"}

    environment = os.environ.get("ENVIRONMENT", "development").strip().lower()

    cors_env = os.environ.get("CORS_ORIGINS")
    if cors_env:
        cors_origins = tuple(o.strip() for o in cors_env.split(",") if o.strip())
    elif environment == "production":
        cors_origins = (
            "http://localhost:8080",
            "http://127.0.0.1:8080",
            "http://localhost",
            "http://127.0.0.1",
        )
    else:
        cors_origins = (
            "http://localhost:3000",
            "http://localhost:5173",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:5173",
            "http://localhost:8080",
            "http://127.0.0.1:8080",
        )

    rate_limit_enabled_str = os.environ.get("RATE_LIMIT_ENABLED", "true").strip().lower()
    rate_limit_enabled = rate_limit_enabled_str not in {"false", "0", "no", "off", "disable"}

    return Settings(
        database_url=database_url,
        mqtt_enabled=mqtt_enabled,
        mqtt_host=os.environ.get("MQTT_HOST", "localhost"),
        mqtt_port=int(os.environ.get("MQTT_PORT", "1883")),
        mqtt_username=mqtt_username,
        mqtt_password=mqtt_password,
        mqtt_topic_prefix=os.environ.get("MQTT_TOPIC_PREFIX", "orvex").strip("/"),
        mqtt_client_id=os.environ.get("MQTT_CLIENT_ID", "orvex-backend-gateway"),
        mqtt_keepalive=int(os.environ.get("MQTT_KEEPALIVE", "60")),
        mqtt_reconnect_interval_seconds=float(os.environ.get("MQTT_RECONNECT_INTERVAL_SECONDS", "5.0")),
        mqtt_tls_enabled=mqtt_tls_enabled,
        mqtt_tls_ca_cert=os.environ.get("MQTT_TLS_CA_CERT") or None,
        mqtt_max_payload_bytes=int(os.environ.get("MQTT_MAX_PAYLOAD_BYTES", "65536")),
        environment=environment,
        cors_origins=cors_origins,
        max_request_body_bytes=int(os.environ.get("MAX_REQUEST_BODY_BYTES", "2097152")),
        rate_limit_enabled=rate_limit_enabled,
        rate_limit_per_minute=int(os.environ.get("RATE_LIMIT_PER_MINUTE", "600")),
        app_version=os.environ.get("APP_VERSION", "1.0.0"),
    )
