from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.dependencies import get_db_session
from app.repositories.alert_repository import AlertNotFoundError, AlertRepository
from app.schemas.alert import AlertAcknowledgeRequest, AlertListResponse, AlertResolveRequest, AlertResponse
from app.services.alert_service import AlertService

router = APIRouter(prefix="/alerts", tags=["alerts"])


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


def get_alert_service(session: Session = Depends(get_db_session)) -> AlertService:
    return AlertService(AlertRepository(session))


@router.get("", response_model=AlertListResponse, status_code=status.HTTP_200_OK)
def list_alerts(
    machine_id: UUID | None = Query(default=None, description="Filter alerts by machine ID"),
    severity: str | None = Query(default=None, description="Filter alerts by severity (info, low, medium, high, critical)"),
    alert_type: str | None = Query(default=None, description="Filter alerts by category/type"),
    status_filter: str | None = Query(default=None, alias="status", description="Filter alerts by status (open, acknowledged, resolved, dismissed)"),
    start_time: str | None = Query(default=None, description="Filter alerts occurring at or after timestamp"),
    end_time: str | None = Query(default=None, description="Filter alerts occurring at or before timestamp"),
    limit: int = Query(default=50, ge=1, le=1000, description="Maximum alerts to return"),
    offset: int = Query(default=0, ge=0, description="Offset for pagination"),
    service: AlertService = Depends(get_alert_service),
) -> AlertListResponse:
    parsed_start = parse_query_datetime(start_time, "start_time")
    parsed_end = parse_query_datetime(end_time, "end_time")
    if parsed_start and parsed_end and parsed_start > parsed_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_time must be strictly before end_time.",
        )

    return service.list_alerts(
        machine_id=machine_id,
        severity=severity,
        alert_type=alert_type,
        status=status_filter,
        start_time=parsed_start,
        end_time=parsed_end,
        limit=limit,
        offset=offset,
    )


@router.get("/{alert_id}", response_model=AlertResponse, status_code=status.HTTP_200_OK)
def get_alert(
    alert_id: UUID,
    service: AlertService = Depends(get_alert_service),
) -> AlertResponse:
    try:
        return service.get_alert_by_id(alert_id)
    except AlertNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error


@router.post("/{alert_id}/acknowledge", response_model=AlertResponse, status_code=status.HTTP_200_OK)
def acknowledge_alert(
    alert_id: UUID,
    _body: AlertAcknowledgeRequest | None = None,
    service: AlertService = Depends(get_alert_service),
) -> AlertResponse:
    try:
        return service.acknowledge_alert(alert_id)
    except AlertNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error


@router.post("/{alert_id}/resolve", response_model=AlertResponse, status_code=status.HTTP_200_OK)
def resolve_alert(
    alert_id: UUID,
    _body: AlertResolveRequest | None = None,
    service: AlertService = Depends(get_alert_service),
) -> AlertResponse:
    try:
        return service.resolve_alert(alert_id)
    except AlertNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error


@router.post("/{alert_id}/dismiss", response_model=AlertResponse, status_code=status.HTTP_200_OK)
def dismiss_alert(
    alert_id: UUID,
    service: AlertService = Depends(get_alert_service),
) -> AlertResponse:
    try:
        return service.dismiss_alert(alert_id)
    except AlertNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error

