from datetime import datetime, timezone
from uuid import UUID

from app.repositories.machine_repository import MachineRepository
from app.repositories.telemetry_repository import TelemetryRepository
from app.schemas.telemetry import TelemetryListResponse, TelemetryRecordResponse
from app.services.machine_service import MachineNotFoundError


class InvalidTimeRangeError(ValueError):
    """Raised when an invalid time range is requested (e.g., start_time > end_time)."""


class TelemetryQueryService:
    def __init__(
        self,
        telemetry_repository: TelemetryRepository,
        machine_repository: MachineRepository,
    ) -> None:
        self._telemetry_repo = telemetry_repository
        self._machine_repo = machine_repository

    def get_telemetry_range(
        self,
        machine_id: UUID,
        *,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> TelemetryListResponse:
        # Validate machine exists
        if self._machine_repo.get_by_id(machine_id) is None:
            raise MachineNotFoundError(f"Machine {machine_id} not found.")

        # Normalize UTC and validate range
        if start_time is not None and start_time.tzinfo is None:
            start_time = start_time.replace(tzinfo=timezone.utc)
        if end_time is not None and end_time.tzinfo is None:
            end_time = end_time.replace(tzinfo=timezone.utc)

        if start_time is not None and end_time is not None and start_time > end_time:
            raise InvalidTimeRangeError("start_time must be less than or equal to end_time.")

        items, total = self._telemetry_repo.get_range(
            machine_id,
            start_time=start_time,
            end_time=end_time,
            limit=limit,
            offset=offset,
        )
        return TelemetryListResponse(
            items=[TelemetryRecordResponse.model_validate(item) for item in items],
            total=total,
            limit=limit,
            offset=offset,
        )
