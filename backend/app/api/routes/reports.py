from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.db.dependencies import get_db_session
from app.repositories.machine_repository import MachineRepository
from app.repositories.telemetry_repository import TelemetryRepository
from app.repositories.wastage_event_repository import WastageEventRepository
from app.schemas.report import EnergyWastageReportResponse
from app.services.energy_analytics_service import EnergyAnalyticsService
from app.services.machine_service import MachineNotFoundError
from app.services.report_service import ReportService
from app.services.telemetry_query_service import InvalidTimeRangeError

router = APIRouter(prefix="/reports", tags=["reports"])


def get_report_service(session: Session = Depends(get_db_session)) -> ReportService:
    machine_repo = MachineRepository(session)
    telemetry_repo = TelemetryRepository(session)
    event_repo = WastageEventRepository(session)
    energy_service = EnergyAnalyticsService(
        machine_repository=machine_repo,
        telemetry_repository=telemetry_repo,
        wastage_event_repository=event_repo,
    )
    return ReportService(
        machine_repository=machine_repo,
        wastage_event_repository=event_repo,
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


@router.get("/energy-wastage", response_model=EnergyWastageReportResponse, status_code=status.HTTP_200_OK)
def get_energy_wastage_report(
    start_time: str | None = Query(default=None, description="Start of report period (UTC, defaults to 24h ago)"),
    end_time: str | None = Query(default=None, description="End of report period (UTC, defaults to now)"),
    machine_id: UUID | None = Query(default=None, description="Optional machine ID filter"),
    format_type: str | None = Query(default=None, alias="format", description="Response format: 'json' (default) or 'csv'"),
    accept: str | None = Header(default=None),
    service: ReportService = Depends(get_report_service),
) -> Response | EnergyWastageReportResponse:
    now = datetime.now(timezone.utc)
    parsed_end = parse_query_datetime(end_time, "end_time") or now
    parsed_start = parse_query_datetime(start_time, "start_time") or (parsed_end - timedelta(hours=24))

    if parsed_start >= parsed_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_time must be strictly before end_time.",
        )

    try:
        report = service.generate_energy_wastage_report(
            start_time=parsed_start,
            end_time=parsed_end,
            machine_id=machine_id,
        )
    except MachineNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except InvalidTimeRangeError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error

    # Return CSV if explicitly requested via ?format=csv or Accept: text/csv
    wants_csv = (format_type and format_type.lower() == "csv") or (accept and "text/csv" in accept.lower())
    if wants_csv:
        csv_content = service.generate_csv(report)
        filename = f"orvex_energy_report_{parsed_start:%Y%m%d}_{parsed_end:%Y%m%d}.csv"
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )

    return report


@router.get("/energy-wastage/csv", status_code=status.HTTP_200_OK)
def get_energy_wastage_report_csv(
    start_time: str | None = Query(default=None, description="Start of report period (UTC, defaults to 24h ago)"),
    end_time: str | None = Query(default=None, description="End of report period (UTC, defaults to now)"),
    machine_id: UUID | None = Query(default=None, description="Optional machine ID filter"),
    service: ReportService = Depends(get_report_service),
) -> Response:
    now = datetime.now(timezone.utc)
    parsed_end = parse_query_datetime(end_time, "end_time") or now
    parsed_start = parse_query_datetime(start_time, "start_time") or (parsed_end - timedelta(hours=24))

    if parsed_start >= parsed_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_time must be strictly before end_time.",
        )

    try:
        report = service.generate_energy_wastage_report(
            start_time=parsed_start,
            end_time=parsed_end,
            machine_id=machine_id,
        )
    except MachineNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except InvalidTimeRangeError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error

    csv_content = service.generate_csv(report)
    filename = f"orvex_energy_report_{parsed_start:%Y%m%d}_{parsed_end:%Y%m%d}.csv"
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )

