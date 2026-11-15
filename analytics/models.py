from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Mapping
from uuid import UUID


class OperatingState(str, Enum):
    STOPPED = "STOPPED"
    STARTING = "STARTING"
    RUNNING = "RUNNING"
    IDLE = "IDLE"
    LOW_LOAD = "LOW_LOAD"
    HIGH_LOAD = "HIGH_LOAD"
    FAULT = "FAULT"


class FeatureQuality(str, Enum):
    GOOD = "GOOD"
    PARTIAL = "PARTIAL"
    INVALID = "INVALID"


class DetectionReason(str, Enum):
    IDLE_WASTAGE = "IDLE_WASTAGE"
    LOW_LOAD_WASTAGE = "LOW_LOAD_WASTAGE"
    ABNORMAL_POWER = "ABNORMAL_POWER"
    START_STOP_CYCLING = "START_STOP_CYCLING"


class DetectionConfidence(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class DetectionStatus(str, Enum):
    CANDIDATE = "CANDIDATE"


@dataclass(frozen=True, slots=True)
class TelemetryInput:
    timestamp: datetime | None
    machine_id: UUID
    sensor_id: UUID | None = None
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

    def __post_init__(self) -> None:
        if self.timestamp is not None:
            if self.timestamp.tzinfo is None or self.timestamp.utcoffset() is None:
                raise ValueError("timestamp must be timezone-aware")
            object.__setattr__(self, "timestamp", self.timestamp.astimezone(timezone.utc))


@dataclass(frozen=True, slots=True)
class FeatureRecord:
    timestamp: datetime | None
    machine_id: UUID
    operating_state: str | None
    load_percent: float | None
    active_power_kw: float | None
    apparent_power_kva: float | None
    power_factor: float | None
    rpm: float | None
    temperature_c: float | None
    energy_increment_kwh: float | None
    cumulative_energy_kwh: float | None
    expected_power_kw: float | None
    excess_power_kw: float | None
    estimated_wasted_energy_kwh: float | None
    idle_power_ratio: float | None
    power_per_load_percent: float | None
    quality: FeatureQuality
    quality_reasons: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class DetectionEvent:
    event_id: UUID
    machine_id: UUID
    start_time: datetime
    end_time: datetime
    duration_seconds: float
    primary_reason: DetectionReason
    contributing_reasons: tuple[DetectionReason, ...]
    peak_excess_power_kw: float | None
    average_excess_power_kw: float | None
    actual_energy_consumed_kwh: float | None
    estimated_wasted_energy_kwh: float | None
    confidence: DetectionConfidence
    quality: FeatureQuality
    status: DetectionStatus
    evidence: Mapping[str, object]