from uuid import UUID

from app.db.models import Machine
from app.repositories.machine_repository import MachineRepository
from app.schemas.machine import MachineListResponse, MachineResponse, MachineSummaryResponse


class MachineNotFoundError(KeyError):
    """Raised when a requested machine cannot be found."""


class MachineService:
    def __init__(self, repository: MachineRepository) -> None:
        self._repository = repository

    def list_machines(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        status: str | None = None,
    ) -> MachineListResponse:
        items, total = self._repository.list_machines(limit=limit, offset=offset, status=status)
        return MachineListResponse(
            items=[MachineResponse.model_validate(item) for item in items],
            total=total,
            limit=limit,
            offset=offset,
        )

    def get_machine(self, machine_id: UUID) -> MachineResponse:
        machine = self._repository.get_by_id(machine_id)
        if machine is None:
            raise MachineNotFoundError(f"Machine {machine_id} not found.")
        return MachineResponse.model_validate(machine)

    def get_machine_summary(
        self,
        machine_id: UUID,
        *,
        fresh_threshold_seconds: float = 60.0,
    ) -> MachineSummaryResponse:
        summary = self._repository.get_summary(
            machine_id,
            fresh_threshold_seconds=fresh_threshold_seconds,
        )
        if summary is None:
            raise MachineNotFoundError(f"Machine {machine_id} not found.")
        return summary
