from datetime import datetime
from enum import Enum
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TelemetryFreshness(str, Enum):
    FRESH = "fresh"
    STALE = "stale"
    MISSING = "missing"


class MachineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    site_id: UUID
    machine_identifier: str
    name: str
    machine_type: str
    manufacturer: str | None = None
    model: str | None = None
    rated_power_kw: float | None = None
    status: str
    created_at: datetime
    updated_at: datetime


class MachineListResponse(BaseModel):
    items: list[MachineResponse]
    total: int
    limit: int
    offset: int


class MachineSummaryResponse(BaseModel):
    machine_id: UUID
    site_id: UUID
    machine_identifier: str
    name: str
    machine_type: str
    status: str
    rated_power_kw: float | None = None
    latest_telemetry_timestamp: datetime | None = None
    latest_operating_state: str | None = None
    latest_active_power: float | None = None
    latest_power_factor: float | None = None
    latest_temperature: float | None = None
    latest_load_percentage: float | None = None
    telemetry_freshness: TelemetryFreshness
    seconds_since_last_telemetry: float | None = None
