from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.dependencies import get_db_session
from app.repositories.machine_repository import MachineRepository
from app.repositories.wastage_event_repository import WastageEventRepository
from app.schemas.wastage_event import WastageEventListResponse, WastageEventResponse
from app.services.telemetry_query_service import InvalidTimeRangeError
from app.services.wastage_event_query_service import WastageEventNotFoundError, WastageEventQueryService

router = APIRouter(prefix="/wastage-events", tags=["wastage-events"])


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


def get_wastage_event_query_service(session: Session = Depends(get_db_session)) -> WastageEventQueryService:
    return WastageEventQueryService(
        event_repository=WastageEventRepository(session),
        machine_repository=MachineRepository(session),
    )


@router.get("", response_model=WastageEventListResponse, status_code=status.HTTP_200_OK)
def list_wastage_events(
    machine_id: UUID | None = Query(default=None, description="Filter events by machine ID"),
    detection_reason: str | None = Query(default=None, description="Filter events by detection reason"),
    status_filter: str | None = Query(default=None, alias="status", description="Filter events by status"),
    start_time: str | None = Query(default=None, description="Filter events starting at or after timestamp"),
    end_time: str | None = Query(default=None, description="Filter events starting at or before timestamp"),
    limit: int = Query(default=50, ge=1, le=100, description="Maximum events to return"),
    offset: int = Query(default=0, ge=0, description="Offset for pagination"),
    service: WastageEventQueryService = Depends(get_wastage_event_query_service),
) -> WastageEventListResponse:
    parsed_start = parse_query_datetime(start_time, "start_time")
    parsed_end = parse_query_datetime(end_time, "end_time")
    try:
        return service.list_events(
            machine_id=machine_id,
            detection_reason=detection_reason,
            status=status_filter,
            start_time=parsed_start,
            end_time=parsed_end,
            limit=limit,
            offset=offset,
        )
    except InvalidTimeRangeError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error


@router.get("/{event_id}", response_model=WastageEventResponse, status_code=status.HTTP_200_OK)
def get_wastage_event(
    event_id: UUID,
    service: WastageEventQueryService = Depends(get_wastage_event_query_service),
) -> WastageEventResponse:
    try:
        return service.get_event_by_id(event_id)
    except WastageEventNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
