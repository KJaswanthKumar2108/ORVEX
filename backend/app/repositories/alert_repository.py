from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from app.db.models import Alert, Machine


class AlertRepositoryError(RuntimeError):
    """Raised when an alert database operation fails."""


class AlertNotFoundError(AlertRepositoryError):
    """Raised when an alert does not exist."""


class AlertRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_by_id(self, alert_id: UUID) -> Alert | None:
        stmt = (
            select(Alert)
            .options(joinedload(Alert.machine))
            .where(Alert.id == alert_id)
        )
        return self._session.scalar(stmt)

    def get_by_event_id(self, event_id: UUID) -> Alert | None:
        stmt = (
            select(Alert)
            .options(joinedload(Alert.machine))
            .where(Alert.event_id == event_id)
        )
        return self._session.scalar(stmt)

    def create(self, alert: Alert) -> Alert:
        self._session.add(alert)
        try:
            self._session.commit()
            self._session.refresh(alert)
            return alert
        except SQLAlchemyError as error:
            self._session.rollback()
            raise AlertRepositoryError("Failed to persist alert.") from error

    def create_or_get_for_event(self, alert: Alert) -> tuple[Alert, bool]:
        """Idempotently insert an alert for an event or return the existing one."""
        if alert.event_id is not None:
            existing = self.get_by_event_id(alert.event_id)
            if existing is not None:
                return existing, False

        # Also check by deterministic ID
        existing_by_id = self.get_by_id(alert.id)
        if existing_by_id is not None:
            return existing_by_id, False

        self._session.add(alert)
        try:
            self._session.commit()
            self._session.refresh(alert)
            return alert, True
        except IntegrityError:
            self._session.rollback()
            # Concurrent insert or duplicate occurred; fetch existing
            if alert.event_id is not None:
                existing = self.get_by_event_id(alert.event_id)
                if existing is not None:
                    return existing, False
            existing_by_id = self.get_by_id(alert.id)
            if existing_by_id is not None:
                return existing_by_id, False
            raise AlertRepositoryError("Integrity error persisting alert.")
        except SQLAlchemyError as error:
            self._session.rollback()
            raise AlertRepositoryError("Failed to create alert.") from error

    def list_alerts(
        self,
        *,
        machine_id: UUID | None = None,
        severity: str | None = None,
        alert_type: str | None = None,
        status: str | None = None,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[Alert], int]:
        filters = []
        if machine_id is not None:
            filters.append(Alert.machine_id == machine_id)
        if severity is not None:
            filters.append(Alert.severity == severity.lower())
        if alert_type is not None:
            filters.append(Alert.alert_type.ilike(f"%{alert_type}%"))
        if status is not None:
            filters.append(Alert.status == status.lower())
        if start_time is not None:
            filters.append(Alert.occurred_at >= start_time)
        if end_time is not None:
            filters.append(Alert.occurred_at <= end_time)

        # Count total
        count_stmt = select(func.count(Alert.id)).where(*filters)
        total = self._session.scalar(count_stmt) or 0

        # Query items
        stmt = (
            select(Alert)
            .options(joinedload(Alert.machine))
            .where(*filters)
            .order_by(Alert.occurred_at.desc(), Alert.id.desc())
            .limit(limit)
            .offset(offset)
        )
        items = list(self._session.scalars(stmt).all())
        return items, total

    def update_status(
        self,
        alert_id: UUID,
        new_status: str,
        resolved_at: datetime | None = None,
    ) -> Alert | None:
        alert = self.get_by_id(alert_id)
        if alert is None:
            return None

        alert.status = new_status
        alert.resolved_at = resolved_at
        try:
            self._session.commit()
            self._session.refresh(alert)
            return alert
        except SQLAlchemyError as error:
            self._session.rollback()
            raise AlertRepositoryError(f"Failed to update alert {alert_id} status.") from error

