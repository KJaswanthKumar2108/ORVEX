from datetime import datetime, timezone
from uuid import UUID

from app.db.models import EnergyWastageEvent
from app.repositories.machine_repository import MachineRepository
from app.repositories.wastage_event_repository import WastageEventRepository
from app.schemas.wastage_event import WastageEventListResponse, WastageEventResponse
from app.services.machine_service import MachineNotFoundError
from app.services.telemetry_query_service import InvalidTimeRangeError


class WastageEventNotFoundError(KeyError):
    """Raised when a requested wastage event cannot be found."""


class WastageEventQueryService:
    def __init__(
        self,
        event_repository: WastageEventRepository,
        machine_repository: MachineRepository,
    ) -> None:
        self._event_repo = event_repository
        self._machine_repo = machine_repository

    def list_events(
        self,
        *,
        machine_id: UUID | None = None,
        detection_reason: str | None = None,
        status: str | None = None,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> WastageEventListResponse:
        if start_time is not None and start_time.tzinfo is None:
            start_time = start_time.replace(tzinfo=timezone.utc)
        if end_time is not None and end_time.tzinfo is None:
            end_time = end_time.replace(tzinfo=timezone.utc)

        if start_time is not None and end_time is not None and start_time > end_time:
            raise InvalidTimeRangeError("start_time must be less than or equal to end_time.")

        items, total = self._event_repo.list_events(
            machine_id=machine_id,
            detection_reason=detection_reason,
            status=status,
            start_time=start_time,
            end_time=end_time,
            limit=limit,
            offset=offset,
        )
        return WastageEventListResponse(
            items=[WastageEventResponse.model_validate(item) for item in items],
            total=total,
            limit=limit,
            offset=offset,
        )

    def list_machine_events(
        self,
        machine_id: UUID,
        *,
        detection_reason: str | None = None,
        status: str | None = None,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> WastageEventListResponse:
        if self._machine_repo.get_by_id(machine_id) is None:
            raise MachineNotFoundError(f"Machine {machine_id} not found.")

        return self.list_events(
            machine_id=machine_id,
            detection_reason=detection_reason,
            status=status,
            start_time=start_time,
            end_time=end_time,
            limit=limit,
            offset=offset,
        )

    def get_event_by_id(self, event_id: UUID) -> WastageEventResponse:
        event = self._event_repo.get_by_id(event_id)
        if event is None:
            raise WastageEventNotFoundError(f"Wastage event {event_id} not found.")
        return WastageEventResponse.model_validate(event)
