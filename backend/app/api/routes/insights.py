from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.dependencies import get_db_session
from app.repositories.corrective_action_repository import CorrectiveActionRepository
from app.repositories.machine_repository import MachineRepository
from app.repositories.telemetry_repository import TelemetryRepository
from app.repositories.wastage_event_repository import WastageEventRepository
from app.schemas.insight import (
    ActionImpactResponse,
    CorrectiveActionCreate,
    CorrectiveActionResponse,
    FleetIntelligenceSummary,
    MachineBaselineResponse,
    MachineInsightDetailResponse,
    PatternAnalysisResponse,
)
from app.services.energy_analytics_service import EnergyAnalyticsService
from app.services.insight_service import InsightService
from app.services.machine_service import MachineNotFoundError
from app.services.telemetry_query_service import InvalidTimeRangeError

router = APIRouter(prefix="/insights", tags=["insights"])


def get_insight_service(session: Session = Depends(get_db_session)) -> InsightService:
    machine_repo = MachineRepository(session)
    telemetry_repo = TelemetryRepository(session)
    event_repo = WastageEventRepository(session)
    action_repo = CorrectiveActionRepository(session)
    energy_service = EnergyAnalyticsService(
        machine_repository=machine_repo,
        telemetry_repository=telemetry_repo,
        wastage_event_repository=event_repo,
    )
    return InsightService(
        machine_repository=machine_repo,
        telemetry_repository=telemetry_repo,
        wastage_event_repository=event_repo,
        corrective_action_repository=action_repo,
        energy_analytics_service=energy_service,
    )


def parse_query_datetime(value: str | None, param_name: str) -> datetime | None:
    if value is None:
        return None
    try:
        val = value.strip().replace(" ", "+")
        dt = datetime.fromisoformat(val)
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid datetime format for {param_name}: {value}",
        ) from error


@router.get("/summary", response_model=FleetIntelligenceSummary, status_code=status.HTTP_200_OK)
def get_fleet_intelligence_summary(
    start_time: str | None = Query(default=None, description="Start of observation period (UTC, defaults to 24h ago)"),
    end_time: str | None = Query(default=None, description="End of observation period (UTC, defaults to now)"),
    service: InsightService = Depends(get_insight_service),
) -> FleetIntelligenceSummary:
    now = datetime.now(timezone.utc)
    parsed_end = parse_query_datetime(end_time, "end_time") or now
    parsed_start = parse_query_datetime(start_time, "start_time") or (parsed_end - timedelta(hours=24))

    if parsed_start >= parsed_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_time must be strictly before end_time.",
        )

    try:
        return service.get_fleet_summary(parsed_start, parsed_end)
    except InvalidTimeRangeError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err)) from err


@router.get("/patterns", response_model=PatternAnalysisResponse, status_code=status.HTTP_200_OK)
def get_pattern_analysis(
    start_time: str | None = Query(default=None, description="Start of observation period (UTC, defaults to 24h ago)"),
    end_time: str | None = Query(default=None, description="End of observation period (UTC, defaults to now)"),
    service: InsightService = Depends(get_insight_service),
) -> PatternAnalysisResponse:
    now = datetime.now(timezone.utc)
    parsed_end = parse_query_datetime(end_time, "end_time") or now
    parsed_start = parse_query_datetime(start_time, "start_time") or (parsed_end - timedelta(hours=24))

    if parsed_start >= parsed_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_time must be strictly before end_time.",
        )

    try:
        return service.get_pattern_analysis(parsed_start, parsed_end)
    except InvalidTimeRangeError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err)) from err


@router.get("/baseline", response_model=MachineBaselineResponse, status_code=status.HTTP_200_OK)
def get_machine_baseline(
    machine_id: UUID = Query(description="Machine UUID for baseline evaluation"),
    start_time: str | None = Query(default=None, description="Start of observation window (defaults to 24h ago)"),
    end_time: str | None = Query(default=None, description="End of observation window (defaults to now)"),
    service: InsightService = Depends(get_insight_service),
) -> MachineBaselineResponse:
    now = datetime.now(timezone.utc)
    parsed_end = parse_query_datetime(end_time, "end_time") or now
    parsed_start = parse_query_datetime(start_time, "start_time") or (parsed_end - timedelta(hours=24))

    if parsed_start >= parsed_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_time must be strictly before end_time.",
        )

    try:
        return service.get_machine_baseline(machine_id, parsed_start, parsed_end)
    except MachineNotFoundError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err
    except InvalidTimeRangeError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err)) from err


@router.get("/action-impact", response_model=ActionImpactResponse, status_code=status.HTTP_200_OK)
def get_action_impact(
    action_id: UUID = Query(description="UUID of the recorded corrective action"),
    window_hours: float = Query(default=24.0, ge=0.5, le=168.0, description="Evaluation window duration in hours"),
    service: InsightService = Depends(get_insight_service),
) -> ActionImpactResponse:
    try:
        return service.assess_action_impact(action_id, window_hours)
    except MachineNotFoundError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err


@router.get("/machines/{machine_id}", response_model=MachineInsightDetailResponse, status_code=status.HTTP_200_OK)
def get_machine_insight_detail(
    machine_id: UUID,
    start_time: str | None = Query(default=None, description="Start of observation period"),
    end_time: str | None = Query(default=None, description="End of observation period"),
    service: InsightService = Depends(get_insight_service),
) -> MachineInsightDetailResponse:
    now = datetime.now(timezone.utc)
    parsed_end = parse_query_datetime(end_time, "end_time") or now
    parsed_start = parse_query_datetime(start_time, "start_time") or (parsed_end - timedelta(hours=24))

    if parsed_start >= parsed_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_time must be strictly before end_time.",
        )

    try:
        return service.get_machine_insight_detail(machine_id, parsed_start, parsed_end)
    except MachineNotFoundError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err
    except InvalidTimeRangeError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err)) from err


# --- Corrective Action Logging Endpoints ---

@router.post("/actions", response_model=CorrectiveActionResponse, status_code=status.HTTP_201_CREATED)
def record_corrective_action(
    payload: CorrectiveActionCreate,
    service: InsightService = Depends(get_insight_service),
) -> CorrectiveActionResponse:
    try:
        return service.record_corrective_action(payload)
    except MachineNotFoundError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err)) from err


@router.get("/actions", response_model=list[CorrectiveActionResponse], status_code=status.HTTP_200_OK)
def list_corrective_actions(
    machine_id: UUID | None = Query(default=None, description="Optional machine ID filter"),
    service: InsightService = Depends(get_insight_service),
) -> list[CorrectiveActionResponse]:
    return service.list_corrective_actions(machine_id)


@router.delete("/actions/{action_id}", status_code=status.HTTP_200_OK)
def delete_corrective_action(
    action_id: UUID,
    service: InsightService = Depends(get_insight_service),
) -> dict[str, bool]:
    deleted = service.delete_corrective_action(action_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Action {action_id} not found.")
    return {"deleted": True}

