from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.models import EnergyWastageEvent


class WastageEventPersistenceError(RuntimeError):
    """Raised when a detection event cannot be stored safely."""


class WastageEventIdentityConflict(WastageEventPersistenceError):
    """Raised when an existing event ID belongs to a different event identity."""


@dataclass(frozen=True, slots=True)
class RepositoryPersistResult:
    record: EnergyWastageEvent
    created: bool


class WastageEventRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_by_id(self, event_id: UUID) -> EnergyWastageEvent | None:
        return self._session.get(EnergyWastageEvent, event_id)

    def find_duplicate(self, record: EnergyWastageEvent) -> EnergyWastageEvent | None:
        return self.get_by_id(record.id)

    def find_existing_episode(
        self,
        machine_id: UUID,
        start_time,
        detection_reason: str,
    ) -> EnergyWastageEvent | None:
        return self._session.scalar(
            select(EnergyWastageEvent).where(
                EnergyWastageEvent.machine_id == machine_id,
                EnergyWastageEvent.start_time == start_time,
                EnergyWastageEvent.detection_reason == detection_reason,
            )
        )

    def create(self, record: EnergyWastageEvent) -> EnergyWastageEvent:
        self._session.add(record)
        try:
            self._session.commit()
            self._session.refresh(record)
            return record
        except SQLAlchemyError as error:
            self._session.rollback()
            raise WastageEventPersistenceError(
                "Database operation failed while creating a detection event."
            ) from error

    def create_or_update(self, record: EnergyWastageEvent) -> RepositoryPersistResult:
        try:
            # Check by ID first
            existing = self.get_by_id(record.id)
            if existing is not None:
                if (
                    existing.machine_id != record.machine_id
                    or existing.start_time != record.start_time
                    or existing.detection_reason != record.detection_reason
                ):
                    raise WastageEventIdentityConflict(
                        "The deterministic event ID is already associated with a different event identity."
                    )
                return RepositoryPersistResult(record=existing, created=False)

            # Check by episode identity
            existing_episode = self.find_existing_episode(
                record.machine_id,
                record.start_time,
                record.detection_reason,
            )
            if existing_episode is not None:
                # Do not silently overwrite previously persisted event data with an incomplete or shorter event window
                if record.end_time is not None and existing_episode.end_time is not None:
                    if record.end_time > existing_episode.end_time:
                        existing_episode.end_time = record.end_time
                        existing_episode.estimated_energy_kwh = record.estimated_energy_kwh
                        existing_episode.estimated_wasted_energy_kwh = record.estimated_wasted_energy_kwh
                        existing_episode.confidence_score = record.confidence_score
                        self._session.commit()
                        self._session.refresh(existing_episode)
                return RepositoryPersistResult(record=existing_episode, created=False)

            # Insert new record
            return self.create_if_not_exists(record)
        except WastageEventPersistenceError:
            self._session.rollback()
            raise
        except SQLAlchemyError as error:
            self._session.rollback()
            raise WastageEventPersistenceError(
                "Database operation failed while persisting a detection event."
            ) from error

    def create_if_not_exists(self, record: EnergyWastageEvent) -> RepositoryPersistResult:
        statement = (
            insert(EnergyWastageEvent)
            .values(
                id=record.id,
                machine_id=record.machine_id,
                start_time=record.start_time,
                end_time=record.end_time,
                estimated_energy_kwh=record.estimated_energy_kwh,
                estimated_wasted_energy_kwh=record.estimated_wasted_energy_kwh,
                detection_reason=record.detection_reason,
                confidence_score=record.confidence_score,
                status=record.status,
            )
            .on_conflict_do_nothing(index_elements=[EnergyWastageEvent.id])
            .returning(EnergyWastageEvent)
        )

        try:
            inserted = self._session.execute(statement).scalar_one_or_none()
            created = inserted is not None
            persisted = inserted or self._session.scalar(
                select(EnergyWastageEvent).where(EnergyWastageEvent.id == record.id)
            )
            if persisted is None:
                raise WastageEventPersistenceError(
                    "Event insert conflicted but the existing event could not be loaded."
                )
            if (
                persisted.machine_id != record.machine_id
                or persisted.start_time != record.start_time
                or persisted.end_time != record.end_time
                or persisted.detection_reason != record.detection_reason
            ):
                raise WastageEventIdentityConflict(
                    "The deterministic event ID is already associated with a different event identity."
                )
            self._session.commit()
            self._session.refresh(persisted)
            return RepositoryPersistResult(record=persisted, created=created)
        except WastageEventPersistenceError:
            self._session.rollback()
            raise
        except SQLAlchemyError as error:
            self._session.rollback()
            raise WastageEventPersistenceError(
                "Database operation failed while persisting a detection event."
            ) from error

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
    ) -> tuple[list[EnergyWastageEvent], int]:
        query = select(EnergyWastageEvent)
        count_query = select(func.count()).select_from(EnergyWastageEvent)

        if machine_id is not None:
            query = query.where(EnergyWastageEvent.machine_id == machine_id)
            count_query = count_query.where(EnergyWastageEvent.machine_id == machine_id)
        if detection_reason is not None:
            query = query.where(EnergyWastageEvent.detection_reason.ilike(f"%{detection_reason}%"))
            count_query = count_query.where(EnergyWastageEvent.detection_reason.ilike(f"%{detection_reason}%"))
        if status is not None:
            query = query.where(EnergyWastageEvent.status == status)
            count_query = count_query.where(EnergyWastageEvent.status == status)
        if start_time is not None:
            query = query.where(EnergyWastageEvent.start_time >= start_time)
            count_query = count_query.where(EnergyWastageEvent.start_time >= start_time)
        if end_time is not None:
            query = query.where(EnergyWastageEvent.start_time <= end_time)
            count_query = count_query.where(EnergyWastageEvent.start_time <= end_time)

        total = self._session.scalar(count_query) or 0
        items = list(
            self._session.scalars(
                query.order_by(EnergyWastageEvent.start_time.desc(), EnergyWastageEvent.id.desc())
                .limit(limit)
                .offset(offset)
            ).all()
        )
        return items, total

    def get_events_intersecting_range(
        self,
        machine_id: UUID,
        start_time: datetime,
        end_time: datetime,
    ) -> list[EnergyWastageEvent]:
        stmt = (
            select(EnergyWastageEvent)
            .where(
                EnergyWastageEvent.machine_id == machine_id,
                EnergyWastageEvent.start_time <= end_time,
                or_(
                    EnergyWastageEvent.end_time.is_(None),
                    EnergyWastageEvent.end_time >= start_time,
                ),
            )
            .order_by(EnergyWastageEvent.start_time.asc(), EnergyWastageEvent.id.asc())
        )
        return list(self._session.scalars(stmt).all())

    def get_all_events_in_range(
        self,
        start_time: datetime,
        end_time: datetime,
    ) -> list[EnergyWastageEvent]:
        stmt = (
            select(EnergyWastageEvent)
            .where(
                EnergyWastageEvent.start_time <= end_time,
                or_(
                    EnergyWastageEvent.end_time.is_(None),
                    EnergyWastageEvent.end_time >= start_time,
                ),
            )
            .order_by(EnergyWastageEvent.start_time.asc(), EnergyWastageEvent.id.asc())
        )
        return list(self._session.scalars(stmt).all())
