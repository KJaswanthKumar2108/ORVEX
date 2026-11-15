from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class AlertResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    machine_id: UUID
    machine_identifier: str | None = None
    machine_name: str | None = None
    event_id: UUID | None = None
    alert_type: str = Field(description="Alert category or reason, matching detection reason")
    severity: str = Field(description="Severity: info, low, medium, high, critical")
    title: str = Field(description="Concise human-readable title")
    description: str = Field(description="Explainable explanation of detected wastage")
    recommendation: str = Field(description="Actionable next-step engineering recommendation")
    status: str = Field(description="Lifecycle status: open, acknowledged, resolved, dismissed")
    occurred_at: datetime
    resolved_at: datetime | None = None
    created_at: datetime


class AlertListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    items: list[AlertResponse]
    total: int
    limit: int
    offset: int


class AlertAcknowledgeRequest(BaseModel):
    comment: str | None = None


class AlertResolveRequest(BaseModel):
    resolution_notes: str | None = None

