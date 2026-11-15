from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from uuid import UUID


class OperatingState(str, Enum):
    STOPPED = "STOPPED"
    STARTING = "STARTING"
    RUNNING = "RUNNING"
    IDLE = "IDLE"
    LOW_LOAD = "LOW_LOAD"
    HIGH_LOAD = "HIGH_LOAD"
    FAULT = "FAULT"


class Scenario(str, Enum):
    NORMAL_OPERATION = "normal"
    IDLE_WASTAGE = "idle_wastage"
    LOW_LOAD_WASTAGE = "low_load_wastage"
    ABNORMAL_POWER = "abnormal_power"
    START_STOP_CYCLING = "start_stop_cycling"


@dataclass(frozen=True, slots=True)
class TelemetryRecord:
    timestamp: datetime
    machine_id: UUID
    sensor_id: UUID | None
    voltage: float
    current: float
    active_power: float
    reactive_power: float
    apparent_power: float
    power_factor: float
    cumulative_energy: float
    rpm: float
    temperature: float
    load_percent: float
    operating_state: OperatingState

    def to_payload(self) -> dict[str, str | float | None]:
        timestamp = self.timestamp.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        return {
            "timestamp": timestamp,
            "machine_id": str(self.machine_id),
            "sensor_id": str(self.sensor_id) if self.sensor_id is not None else None,
            "voltage": self.voltage,
            "current": self.current,
            "active_power": self.active_power,
            "reactive_power": self.reactive_power,
            "apparent_power": self.apparent_power,
            "power_factor": self.power_factor,
            "cumulative_energy": self.cumulative_energy,
            "rpm": self.rpm,
            "temperature": self.temperature,
            "load_percent": self.load_percent,
            "operating_state": self.operating_state.value,
        }