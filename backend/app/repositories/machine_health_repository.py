from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from app.db.models import MachineHealthWarning, MaintenanceObservation


class MachineHealthRepositoryError(RuntimeError):
    """Raised when a machine health database operation fails."""


class MachineHealthRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    # ---------------------------------------------------------
    # Warning Operations
    # ---------------------------------------------------------

    def create_warning(self, warning: MachineHealthWarning) -> MachineHealthWarning:
        self._session.add(warning)
        try:
            self._session.commit()
            self._session.refresh(warning)
            return warning
        except SQLAlchemyError as error:
            self._session.rollback()
            raise MachineHealthRepositoryError("Failed to persist machine health warning.") from error

    def get_warning_by_id(self, warning_id: UUID) -> MachineHealthWarning | None:
        stmt = (
            select(MachineHealthWarning)
            .options(joinedload(MachineHealthWarning.machine))
            .where(MachineHealthWarning.id == warning_id)
        )
        return self._session.scalar(stmt)

    def get_active_warning(self, machine_id: UUID, warning_type: str) -> MachineHealthWarning | None:
        """Find an existing open or acknowledged warning for this machine and type to prevent duplicates."""
        stmt = (
            select(MachineHealthWarning)
            .where(
                MachineHealthWarning.machine_id == machine_id,
                MachineHealthWarning.warning_type == warning_type,
                MachineHealthWarning.status.in_(["open", "acknowledged"]),
            )
            .order_by(MachineHealthWarning.detected_at.desc())
            .limit(1)
        )
        return self._session.scalar(stmt)

    def list_warnings_for_machine(
        self,
        machine_id: UUID,
        status: str | None = None,
        severity: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[MachineHealthWarning]:
        stmt = (
            select(MachineHealthWarning)
            .options(joinedload(MachineHealthWarning.machine))
            .where(MachineHealthWarning.machine_id == machine_id)
        )
        if status:
            stmt = stmt.where(MachineHealthWarning.status == status)
        if severity:
            stmt = stmt.where(MachineHealthWarning.severity == severity.upper())

        stmt = stmt.order_by(MachineHealthWarning.detected_at.desc()).offset(offset).limit(limit)
        return list(self._session.scalars(stmt).unique().all())

    def list_fleet_warnings(
        self,
        machine_id: UUID | None = None,
        status: str | None = None,
        severity: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[MachineHealthWarning]:
        stmt = select(MachineHealthWarning).options(joinedload(MachineHealthWarning.machine))
        if machine_id:
            stmt = stmt.where(MachineHealthWarning.machine_id == machine_id)
        if status:
            stmt = stmt.where(MachineHealthWarning.status == status)
        if severity:
            stmt = stmt.where(MachineHealthWarning.severity == severity.upper())

        stmt = stmt.order_by(MachineHealthWarning.detected_at.desc()).offset(offset).limit(limit)
        return list(self._session.scalars(stmt).unique().all())

    def count_fleet_warnings(
        self,
        machine_id: UUID | None = None,
        status: str | None = None,
        severity: str | None = None,
    ) -> int:
        stmt = select(func.count(MachineHealthWarning.id))
        if machine_id:
            stmt = stmt.where(MachineHealthWarning.machine_id == machine_id)
        if status:
            stmt = stmt.where(MachineHealthWarning.status == status)
        if severity:
            stmt = stmt.where(MachineHealthWarning.severity == severity.upper())

        return int(self._session.scalar(stmt) or 0)

    def update_warning(self, warning: MachineHealthWarning) -> MachineHealthWarning:
        try:
            self._session.commit()
            self._session.refresh(warning)
            return warning
        except SQLAlchemyError as error:
            self._session.rollback()
            raise MachineHealthRepositoryError("Failed to update machine health warning.") from error

    def acknowledge_warning(
        self, warning_id: UUID, acknowledged_by: str, notes: str | None = None
    ) -> MachineHealthWarning | None:
        warning = self.get_warning_by_id(warning_id)
        if warning is None:
            return None

        warning.status = "acknowledged"
        warning.acknowledged_at = datetime.now(timezone.utc)
        warning.acknowledged_by = acknowledged_by
        if notes:
            warning.recommended_action = f"{warning.recommended_action} [Ack note: {notes}]"

        return self.update_warning(warning)

    def resolve_warning(self, warning_id: UUID) -> MachineHealthWarning | None:
        warning = self.get_warning_by_id(warning_id)
        if warning is None:
            return None

        warning.status = "resolved"
        warning.resolved_at = datetime.now(timezone.utc)
        return self.update_warning(warning)

    def delete_warning(self, warning_id: UUID) -> bool:
        warning = self.get_warning_by_id(warning_id)
        if warning is None:
            return False
        try:
            self._session.delete(warning)
            self._session.commit()
            return True
        except SQLAlchemyError as error:
            self._session.rollback()
            raise MachineHealthRepositoryError("Failed to delete machine health warning.") from error

    # ---------------------------------------------------------
    # Observation Operations
    # ---------------------------------------------------------

    def create_observation(self, observation: MaintenanceObservation) -> MaintenanceObservation:
        self._session.add(observation)
        try:
            self._session.commit()
            self._session.refresh(observation)
            return observation
        except SQLAlchemyError as error:
            self._session.rollback()
            raise MachineHealthRepositoryError("Failed to persist maintenance observation.") from error

    def get_observation_by_id(self, observation_id: UUID) -> MaintenanceObservation | None:
        stmt = (
            select(MaintenanceObservation)
            .options(joinedload(MaintenanceObservation.machine), joinedload(MaintenanceObservation.linked_warning))
            .where(MaintenanceObservation.id == observation_id)
        )
        return self._session.scalar(stmt)

    def list_observations_for_machine(
        self, machine_id: UUID, limit: int = 50, offset: int = 0
    ) -> list[MaintenanceObservation]:
        stmt = (
            select(MaintenanceObservation)
            .options(joinedload(MaintenanceObservation.machine), joinedload(MaintenanceObservation.linked_warning))
            .where(MaintenanceObservation.machine_id == machine_id)
            .order_by(MaintenanceObservation.inspection_date.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(self._session.scalars(stmt).unique().all())

    def list_all_observations(self, limit: int = 50, offset: int = 0) -> list[MaintenanceObservation]:
        stmt = (
            select(MaintenanceObservation)
            .options(joinedload(MaintenanceObservation.machine), joinedload(MaintenanceObservation.linked_warning))
            .order_by(MaintenanceObservation.inspection_date.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(self._session.scalars(stmt).unique().all())

    def delete_observation(self, observation_id: UUID) -> bool:
        obs = self.get_observation_by_id(observation_id)
        if obs is None:
            return False
        try:
            self._session.delete(obs)
            self._session.commit()
            return True
        except SQLAlchemyError as error:
            self._session.rollback()
            raise MachineHealthRepositoryError("Failed to delete maintenance observation.") from error

