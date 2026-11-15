from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class EnergyDataQuality(str, Enum):
    GOOD = "GOOD"
    PARTIAL = "PARTIAL"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"


class EnergySummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    machine_id: UUID
    start_time: datetime
    end_time: datetime
    actual_energy_kwh: float | None = Field(
        default=None,
        description="Actual energy consumed (kWh) integrated over continuous telemetry samples via trapezoidal integration.",
    )
    estimated_wasted_energy_kwh: float | None = Field(
        default=None,
        description="Estimated wasted energy (kWh) from persisted wastage events intersecting the time window, avoiding double-counting.",
    )
    wastage_event_count: int = Field(
        default=0,
        description="Number of distinct persisted wastage events intersecting the time window.",
    )
    operating_duration_seconds: float = Field(
        default=0.0,
        description="Duration (seconds) where the machine was in an operating state (non-stopped).",
    )
    idle_duration_seconds: float = Field(
        default=0.0,
        description="Duration (seconds) where the machine was in IDLE state.",
    )
    low_load_duration_seconds: float = Field(
        default=0.0,
        description="Duration (seconds) where the machine was in LOW_LOAD state.",
    )
    abnormal_power_duration_seconds: float = Field(
        default=0.0,
        description="Duration (seconds) of detected abnormal power wastage episodes.",
    )
    data_coverage_ratio: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Ratio of continuous covered telemetry time to the requested window duration.",
    )
    quality: EnergyDataQuality = Field(
        default=EnergyDataQuality.INSUFFICIENT_DATA,
        description="Data quality indicator reflecting telemetry coverage and measurement availability.",
    )
    telemetry_sample_count: int = Field(
        default=0,
        description="Total number of telemetry samples within the requested window.",
    )
