from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
from uuid import UUID

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True, slots=True)
class EdgeConfig:
    """Configuration for the edge sensor acquisition and MQTT publisher layer."""

    mqtt_host: str
    mqtt_port: int
    mqtt_username: str | None
    mqtt_password: str | None
    mqtt_topic_prefix: str
    mqtt_client_id: str
    machine_id: UUID
    sensor_id: UUID | None
    adapter_type: str
    poll_interval_seconds: float
    modbus_port: str
    modbus_baudrate: int
    modbus_parity: str
    modbus_stopbits: int
    modbus_unit_id: int
    modbus_timeout: float
    rated_power_kw: float | None


def get_edge_config(
    machine_id: UUID | str | None = None,
    sensor_id: UUID | str | None = None,
    adapter_type: str | None = None,
    poll_interval_seconds: float | None = None,
) -> EdgeConfig:
    """Load configuration from environment variables with sensible defaults."""
    load_dotenv(PROJECT_ROOT / ".env", override=False)

    raw_mid = machine_id or os.environ.get("EDGE_MACHINE_ID", "00000000-0000-0000-de30-000000000011")
    parsed_mid = UUID(str(raw_mid).strip())

    raw_sid = sensor_id or os.environ.get("EDGE_SENSOR_ID") or None
    parsed_sid = UUID(str(raw_sid).strip()) if raw_sid else None

    chosen_adapter = (adapter_type or os.environ.get("EDGE_ADAPTER_TYPE", "mock")).strip().lower()
    interval = float(poll_interval_seconds or os.environ.get("EDGE_POLL_INTERVAL_SECONDS", "1.0"))

    mqtt_username = os.environ.get("MQTT_USERNAME") or None
    if mqtt_username == "":
        mqtt_username = None

    mqtt_password = os.environ.get("MQTT_PASSWORD") or None
    if mqtt_password == "":
        mqtt_password = None

    rated_power_str = os.environ.get("EDGE_RATED_POWER_KW") or None
    rated_power = float(rated_power_str) if rated_power_str else None

    return EdgeConfig(
        mqtt_host=os.environ.get("MQTT_HOST", "localhost").strip(),
        mqtt_port=int(os.environ.get("MQTT_PORT", "1883")),
        mqtt_username=mqtt_username,
        mqtt_password=mqtt_password,
        mqtt_topic_prefix=os.environ.get("MQTT_TOPIC_PREFIX", "orvex").strip().strip("/"),
        mqtt_client_id=os.environ.get("EDGE_MQTT_CLIENT_ID", "orvex-edge-collector").strip(),
        machine_id=parsed_mid,
        sensor_id=parsed_sid,
        adapter_type=chosen_adapter,
        poll_interval_seconds=max(0.1, interval),
        modbus_port=os.environ.get("MODBUS_PORT", "COM3").strip(),
        modbus_baudrate=int(os.environ.get("MODBUS_BAUDRATE", "9600")),
        modbus_parity=os.environ.get("MODBUS_PARITY", "N").strip().upper(),
        modbus_stopbits=int(os.environ.get("MODBUS_STOPBITS", "1")),
        modbus_unit_id=int(os.environ.get("MODBUS_UNIT_ID", "1")),
        modbus_timeout=float(os.environ.get("MODBUS_TIMEOUT", "1.0")),
        rated_power_kw=rated_power,
    )

