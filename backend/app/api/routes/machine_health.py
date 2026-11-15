from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.dependencies import get_db_session
from app.repositories.machine_health_repository import MachineHealthRepository
from app.repositories.machine_repository import MachineRepository
from app.repositories.telemetry_repository import TelemetryRepository
from app.schemas.machine_health import (
    FleetHealthSummaryResponse,
    MachineHealthDetailResponse,
    MachineHealthWarningResponse,
    MaintenanceObservationCreate,
    MaintenanceObservationResponse,
    WarningAcknowledgeRequest,
)
from app.services.machine_health_service import MachineHealthService

router = APIRouter(prefix="/machine-health", tags=["machine-health"])


def get_machine_health_service(session: Session = Depends(get_db_session)) -> MachineHealthService:
    machine_repo = MachineRepository(session)
    telemetry_repo = TelemetryRepository(session)
    health_repo = MachineHealthRepository(session)
    return MachineHealthService(
        machine_repository=machine_repo,
        telemetry_repository=telemetry_repo,
        health_repository=health_repo,
    )


@router.get(
    "/summary",
    response_model=FleetHealthSummaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Get fleet machine health overview and status breakdown",
)
def get_fleet_health_summary(
    service: MachineHealthService = Depends(get_machine_health_service),
) -> FleetHealthSummaryResponse:
    return service.get_fleet_health_summary()


@router.get(
    "/machines/{machine_id}",
    response_model=MachineHealthDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Get detailed condition-monitoring health analysis for a machine",
)
def get_machine_health_detail(
    machine_id: UUID,
    window_hours: float = Query(default=24.0, ge=0.1, le=720.0, description="Telemetry analysis window in hours"),
    service: MachineHealthService = Depends(get_machine_health_service),
) -> MachineHealthDetailResponse:
    detail = service.get_machine_health_detail(machine_id, window_hours=window_hours)
    if detail is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Machine '{machine_id}' was not found.",
        )
    return detail


@router.get(
    "/machines/{machine_id}/warnings",
    response_model=list[MachineHealthWarningResponse],
    status_code=status.HTTP_200_OK,
    summary="Get condition-monitoring warnings for a specific machine",
)
def get_machine_warnings(
    machine_id: UUID,
    severity: str | None = Query(default=None, description="Filter by severity: WATCH, WARNING, CRITICAL"),
    status_filter: str | None = Query(default=None, alias="status", description="Filter by status: open, acknowledged, resolved"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    service: MachineHealthService = Depends(get_machine_health_service),
) -> list[MachineHealthWarningResponse]:
    return service.list_warnings(
        machine_id=machine_id,
        severity=severity,
        status=status_filter,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/warnings",
    response_model=list[MachineHealthWarningResponse],
    status_code=status.HTTP_200_OK,
    summary="List fleet-wide machine condition warnings",
)
def list_fleet_warnings(
    machine_id: UUID | None = Query(default=None, description="Optional machine ID filter"),
    severity: str | None = Query(default=None, description="Filter by severity: WATCH, WARNING, CRITICAL"),
    status_filter: str | None = Query(default=None, alias="status", description="Filter by status: open, acknowledged, resolved"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    service: MachineHealthService = Depends(get_machine_health_service),
) -> list[MachineHealthWarningResponse]:
    return service.list_warnings(
        machine_id=machine_id,
        severity=severity,
        status=status_filter,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/warnings/{warning_id}/acknowledge",
    response_model=MachineHealthWarningResponse,
    status_code=status.HTTP_200_OK,
    summary="Acknowledge an active condition-monitoring warning",
)
def acknowledge_warning(
    warning_id: UUID,
    payload: WarningAcknowledgeRequest,
    service: MachineHealthService = Depends(get_machine_health_service),
) -> MachineHealthWarningResponse:
    warning = service.acknowledge_warning(
        warning_id=warning_id,
        acknowledged_by=payload.acknowledged_by,
        notes=payload.notes,
    )
    if warning is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Warning '{warning_id}' was not found.",
        )
    return warning


@router.post(
    "/observations",
    response_model=MaintenanceObservationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record an operator or technician maintenance inspection observation",
)
def create_maintenance_observation(
    payload: MaintenanceObservationCreate,
    service: MachineHealthService = Depends(get_machine_health_service),
) -> MaintenanceObservationResponse:
    try:
        return service.create_observation(payload)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(err),
        )

