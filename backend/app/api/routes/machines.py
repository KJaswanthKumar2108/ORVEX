from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.dependencies import get_db_session
from app.repositories.alert_repository import AlertRepository
from app.repositories.machine_repository import MachineRepository
from app.repositories.telemetry_repository import TelemetryRepository
from app.repositories.wastage_event_repository import WastageEventRepository
from app.schemas.alert import AlertListResponse
from app.schemas.energy import EnergySummaryResponse
from app.schemas.machine import MachineListResponse, MachineResponse, MachineSummaryResponse
from app.schemas.telemetry import TelemetryListResponse
from app.schemas.wastage_event import WastageEventListResponse
from app.services.alert_service import AlertService
from app.services.energy_analytics_service import EnergyAnalyticsService
from app.services.machine_service import MachineNotFoundError, MachineService
from app.services.telemetry_query_service import InvalidTimeRangeError, TelemetryQueryService
from app.services.wastage_event_query_service import WastageEventQueryService

router = APIRouter(prefix="/machines", tags=["machines"])


def get_machine_service(session: Session = Depends(get_db_session)) -> MachineService:
    return MachineService(MachineRepository(session))


def get_telemetry_query_service(session: Session = Depends(get_db_session)) -> TelemetryQueryService:
    return TelemetryQueryService(
        telemetry_repository=TelemetryRepository(session),
        machine_repository=MachineRepository(session),
    )


def get_energy_analytics_service(session: Session = Depends(get_db_session)) -> EnergyAnalyticsService:
    return EnergyAnalyticsService(
        machine_repository=MachineRepository(session),
        telemetry_repository=TelemetryRepository(session),
        wastage_event_repository=WastageEventRepository(session),
    )


def get_wastage_event_query_service(session: Session = Depends(get_db_session)) -> WastageEventQueryService:
    return WastageEventQueryService(
        event_repository=WastageEventRepository(session),
        machine_repository=MachineRepository(session),
    )


def get_alert_service(session: Session = Depends(get_db_session)) -> AlertService:
    return AlertService(AlertRepository(session))


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


@router.get("", response_model=MachineListResponse, status_code=status.HTTP_200_OK)
def list_machines(
    limit: int = Query(default=50, ge=1, le=100, description="Maximum number of machines to return"),
    offset: int = Query(default=0, ge=0, description="Offset for pagination"),
    status_filter: str | None = Query(default=None, alias="status", description="Filter machines by status"),
    service: MachineService = Depends(get_machine_service),
) -> MachineListResponse:
    return service.list_machines(limit=limit, offset=offset, status=status_filter)


@router.get("/{machine_id}", response_model=MachineResponse, status_code=status.HTTP_200_OK)
def get_machine(
    machine_id: UUID,
    service: MachineService = Depends(get_machine_service),
) -> MachineResponse:
    try:
        return service.get_machine(machine_id)
    except MachineNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error


@router.get("/{machine_id}/summary", response_model=MachineSummaryResponse, status_code=status.HTTP_200_OK)
def get_machine_summary(
    machine_id: UUID,
    fresh_threshold_seconds: float = Query(
        default=60.0,
        ge=1.0,
        description="Threshold in seconds to classify telemetry as fresh vs stale",
    ),
    service: MachineService = Depends(get_machine_service),
) -> MachineSummaryResponse:
    try:
        return service.get_machine_summary(machine_id, fresh_threshold_seconds=fresh_threshold_seconds)
    except MachineNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error


@router.get("/{machine_id}/telemetry", response_model=TelemetryListResponse, status_code=status.HTTP_200_OK)
def get_machine_telemetry(
    machine_id: UUID,
    start_time: str | None = Query(default=None, description="Start of time range (UTC)"),
    end_time: str | None = Query(default=None, description="End of time range (UTC)"),
    limit: int = Query(default=100, ge=1, le=1000, description="Maximum records to return"),
    offset: int = Query(default=0, ge=0, description="Offset for pagination"),
    service: TelemetryQueryService = Depends(get_telemetry_query_service),
) -> TelemetryListResponse:
    parsed_start = parse_query_datetime(start_time, "start_time")
    parsed_end = parse_query_datetime(end_time, "end_time")
    try:
        return service.get_telemetry_range(
            machine_id,
            start_time=parsed_start,
            end_time=parsed_end,
            limit=limit,
            offset=offset,
        )
    except MachineNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except InvalidTimeRangeError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error


@router.get("/{machine_id}/energy-summary", response_model=EnergySummaryResponse, status_code=status.HTTP_200_OK)
def get_machine_energy_summary(
    machine_id: UUID,
    start_time: str = Query(..., description="Start of time window (UTC)"),
    end_time: str = Query(..., description="End of time window (UTC)"),
    service: EnergyAnalyticsService = Depends(get_energy_analytics_service),
) -> EnergySummaryResponse:
    parsed_start = parse_query_datetime(start_time, "start_time")
    parsed_end = parse_query_datetime(end_time, "end_time")
    if parsed_start is None or parsed_end is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="start_time and end_time are required.")
    try:
        return service.get_energy_summary(
            machine_id,
            start_time=parsed_start,
            end_time=parsed_end,
        )
    except MachineNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except InvalidTimeRangeError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error


@router.get("/{machine_id}/wastage-events", response_model=WastageEventListResponse, status_code=status.HTTP_200_OK)
def get_machine_wastage_events(
    machine_id: UUID,
    detection_reason: str | None = Query(default=None, description="Filter by detection reason"),
    status_filter: str | None = Query(default=None, alias="status", description="Filter by event status"),
    start_time: str | None = Query(default=None, description="Filter events starting at or after timestamp"),
    end_time: str | None = Query(default=None, description="Filter events starting at or before timestamp"),
    limit: int = Query(default=50, ge=1, le=100, description="Maximum events to return"),
    offset: int = Query(default=0, ge=0, description="Pagination offset"),
    service: WastageEventQueryService = Depends(get_wastage_event_query_service),
) -> WastageEventListResponse:
    parsed_start = parse_query_datetime(start_time, "start_time")
    parsed_end = parse_query_datetime(end_time, "end_time")
    try:
        return service.list_machine_events(
            machine_id,
            detection_reason=detection_reason,
            status=status_filter,
            start_time=parsed_start,
            end_time=parsed_end,
            limit=limit,
            offset=offset,
        )
    except MachineNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except InvalidTimeRangeError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error


@router.get("/{machine_id}/alerts", response_model=AlertListResponse, status_code=status.HTTP_200_OK)
def get_machine_alerts(
    machine_id: UUID,
    severity: str | None = Query(default=None, description="Filter alerts by severity"),
    alert_type: str | None = Query(default=None, description="Filter alerts by category/type"),
    status_filter: str | None = Query(default=None, alias="status", description="Filter alerts by status"),
    start_time: str | None = Query(default=None, description="Filter alerts occurring at or after timestamp"),
    end_time: str | None = Query(default=None, description="Filter alerts occurring at or before timestamp"),
    limit: int = Query(default=50, ge=1, le=1000, description="Maximum alerts to return"),
    offset: int = Query(default=0, ge=0, description="Pagination offset"),
    machine_service: MachineService = Depends(get_machine_service),
    alert_service: AlertService = Depends(get_alert_service),
) -> AlertListResponse:
    try:
        machine_service.get_machine(machine_id)
    except MachineNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error

    parsed_start = parse_query_datetime(start_time, "start_time")
    parsed_end = parse_query_datetime(end_time, "end_time")
    if parsed_start and parsed_end and parsed_start > parsed_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_time must be strictly before end_time.",
        )

    return alert_service.list_alerts(
        machine_id=machine_id,
        severity=severity,
        alert_type=alert_type,
        status=status_filter,
        start_time=parsed_start,
        end_time=parsed_end,
        limit=limit,
        offset=offset,
    )
