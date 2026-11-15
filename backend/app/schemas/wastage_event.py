from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class WastageEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    machine_id: UUID
    start_time: datetime
    end_time: datetime | None = None
    duration_seconds: float | None = None
    estimated_energy_kwh: float
    estimated_wasted_energy_kwh: float | None = None
    detection_reason: str
    confidence_score: float | None = None
    status: str
    created_at: datetime


class WastageEventListResponse(BaseModel):
    items: list[WastageEventResponse]
    total: int
    limit: int
    offset: int
