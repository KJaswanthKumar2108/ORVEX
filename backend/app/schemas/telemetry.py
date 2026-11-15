from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

FiniteNumber = Annotated[float, Field(allow_inf_nan=False)]
NonNegativeNumber = Annotated[float, Field(ge=0, allow_inf_nan=False)]
PowerFactor = Annotated[float, Field(ge=-1, le=1, allow_inf_nan=False)]
LoadPercent = Annotated[float, Field(ge=0, le=100, allow_inf_nan=False)]


class TelemetryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    timestamp: datetime
    machine_id: UUID
    sensor_id: UUID | None = None
    voltage: NonNegativeNumber | None = None
    current: NonNegativeNumber | None = None
    active_power: FiniteNumber | None = None
    reactive_power: FiniteNumber | None = None
    apparent_power: NonNegativeNumber | None = None
    power_factor: PowerFactor | None = None
    cumulative_energy: NonNegativeNumber | None = None
    rpm: NonNegativeNumber | None = None
    temperature: FiniteNumber | None = None
    load_percent: LoadPercent | None = None
    operating_state: Annotated[str, Field(max_length=32)] | None = None

    @field_validator("timestamp")
    @classmethod
    def require_timezone_and_normalize_utc(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timestamp must include a timezone")
        return value.astimezone(timezone.utc)


class TelemetryIngested(BaseModel):
    id: UUID
    timestamp: datetime


class TelemetryRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    timestamp: datetime
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
    load_percentage: float | None = None
    operating_state: str | None = None


class TelemetryListResponse(BaseModel):
    items: list[TelemetryRecordResponse]
    total: int
    limit: int
    offset: int