from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID


class SensorConnectionStatus(str, Enum):
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    COMMUNICATION_ERROR = "communication_error"
    DEGRADED = "degraded"


@dataclass(frozen=True, slots=True)
class RawReading:
    """Raw physical reading captured by a hardware sensor adapter.

    Optional measurements that are unavailable or unmeasured by the specific
    hardware meter must remain None (never defaulted to 0.0).
    """

    timestamp: datetime
    voltage: float | None = None
    current: float | None = None
    active_power: float | None = None
    reactive_power: float | None = None
    apparent_power: float | None = None
    power_factor: float | None = None
    cumulative_energy: float | None = None
    rpm: float | None = None
    temperature: float | None = None
    load_percent: float | None = None
    operating_state: str | None = None
    is_valid: bool = True
    error_message: str | None = None

    def to_telemetry_payload(
        self,
        machine_id: UUID,
        sensor_id: UUID | None = None,
    ) -> dict[str, Any]:
        """Convert to dictionary strictly conforming to the ORVEX TelemetryCreate schema.

        Omits keys that are None or converts them to None explicitly while ensuring
        forbidden extra keys are not introduced.
        """
        payload: dict[str, Any] = {
            "timestamp": self.timestamp.isoformat(),
            "machine_id": str(machine_id),
        }
        if sensor_id is not None:
            payload["sensor_id"] = str(sensor_id)
        else:
            payload["sensor_id"] = None

        if self.voltage is not None:
            payload["voltage"] = float(self.voltage)
        if self.current is not None:
            payload["current"] = float(self.current)
        if self.active_power is not None:
            payload["active_power"] = float(self.active_power)
        if self.reactive_power is not None:
            payload["reactive_power"] = float(self.reactive_power)
        if self.apparent_power is not None:
            payload["apparent_power"] = float(self.apparent_power)
        if self.power_factor is not None:
            payload["power_factor"] = float(self.power_factor)
        if self.cumulative_energy is not None:
            payload["cumulative_energy"] = float(self.cumulative_energy)
        if self.rpm is not None:
            payload["rpm"] = float(self.rpm)
        if self.temperature is not None:
            payload["temperature"] = float(self.temperature)
        if self.load_percent is not None:
            payload["load_percent"] = float(self.load_percent)
        if self.operating_state is not None:
            payload["operating_state"] = str(self.operating_state)

        return payload


@dataclass(slots=True)
class SensorHealth:
    """Operational health metrics for a hardware sensor adapter."""

    status: SensorConnectionStatus = SensorConnectionStatus.DISCONNECTED
    consecutive_errors: int = 0
    total_readings: int = 0
    successful_readings: int = 0
    failed_readings: int = 0
    last_success_at: datetime | None = None
    last_error_at: datetime | None = None
    last_error_message: str | None = None

    def record_success(self, timestamp: datetime) -> None:
        self.status = SensorConnectionStatus.CONNECTED
        self.consecutive_errors = 0
        self.total_readings += 1
        self.successful_readings += 1
        self.last_success_at = timestamp

    def record_failure(self, timestamp: datetime, error_message: str) -> None:
        self.consecutive_errors += 1
        self.total_readings += 1
        self.failed_readings += 1
        self.last_error_at = timestamp
        self.last_error_message = error_message
        if self.consecutive_errors >= 3:
            self.status = SensorConnectionStatus.COMMUNICATION_ERROR
        else:
            self.status = SensorConnectionStatus.DEGRADED

    def record_disconnected(self) -> None:
        self.status = SensorConnectionStatus.DISCONNECTED

