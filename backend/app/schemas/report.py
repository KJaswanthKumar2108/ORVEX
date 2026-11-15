from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ReportReasonBreakdown(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    reason: str
    event_count: int
    total_duration_seconds: float
    estimated_wasted_energy_kwh: float | None = Field(
        description="Wasted energy in kWh for this reason, or null if unquantified (e.g. cycling)"
    )
    unestimated_event_count: int = Field(
        description="Count of events where wasted energy was not estimated (e.g. cycling)"
    )


class ReportMachineBreakdown(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    machine_id: UUID
    machine_identifier: str
    machine_name: str
    machine_type: str
    actual_energy_kwh: float | None
    estimated_wasted_energy_kwh: float | None
    total_wastage_events: int
    unestimated_wastage_events: int
    total_event_duration_seconds: float
    data_coverage_ratio: float
    quality: str


class ReportEventDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    event_id: UUID
    machine_id: UUID
    machine_identifier: str
    machine_name: str
    start_time: datetime
    end_time: datetime | None = None
    duration_seconds: float | None = None
    detection_reason: str
    estimated_wasted_energy_kwh: float | None = None
    confidence_score: float | None = None
    status: str


class EnergyWastageReportResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    start_time: datetime
    end_time: datetime
    machine_id: UUID | None = None
    machine_name: str | None = None
    actual_energy_kwh: float | None = Field(
        description="Measured actual energy consumption in kWh across valid continuous intervals"
    )
    estimated_wasted_energy_kwh: float | None = Field(
        description="Conservative estimated potential energy wastage in kWh (not guaranteed savings)"
    )
    total_wastage_events: int
    unestimated_wastage_events: int = Field(
        description="Count of events for which wasted energy was not estimated (e.g. cycling candidates)"
    )
    total_event_duration_seconds: float
    data_coverage_ratio: float | None
    overall_quality: str
    by_reason: list[ReportReasonBreakdown]
    by_machine: list[ReportMachineBreakdown]
    events_detail: list[ReportEventDetail]
    generated_at: datetime

