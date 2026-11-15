from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from app.db.models import CorrectiveAction


class CorrectiveActionRepositoryError(RuntimeError):
    """Raised when a corrective action database operation fails."""


class CorrectiveActionNotFoundError(CorrectiveActionRepositoryError):
    """Raised when a corrective action does not exist."""


class CorrectiveActionRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_by_id(self, action_id: UUID) -> CorrectiveAction | None:
        stmt = (
            select(CorrectiveAction)
            .options(joinedload(CorrectiveAction.machine))
            .where(CorrectiveAction.id == action_id)
        )
        return self._session.scalar(stmt)

    def create(self, action: CorrectiveAction) -> CorrectiveAction:
        self._session.add(action)
        try:
            self._session.commit()
            self._session.refresh(action)
            return action
        except SQLAlchemyError as error:
            self._session.rollback()
            raise CorrectiveActionRepositoryError("Failed to persist corrective action.") from error

    def list_for_machine(self, machine_id: UUID, limit: int = 50) -> list[CorrectiveAction]:
        stmt = (
            select(CorrectiveAction)
            .options(joinedload(CorrectiveAction.machine))
            .where(CorrectiveAction.machine_id == machine_id)
            .order_by(CorrectiveAction.performed_at.desc())
            .limit(limit)
        )
        return list(self._session.scalars(stmt).unique().all())

    def list_all(self, limit: int = 100) -> list[CorrectiveAction]:
        stmt = (
            select(CorrectiveAction)
            .options(joinedload(CorrectiveAction.machine))
            .order_by(CorrectiveAction.performed_at.desc())
            .limit(limit)
        )
        return list(self._session.scalars(stmt).unique().all())

    def delete(self, action_id: UUID) -> bool:
        action = self.get_by_id(action_id)
        if action is None:
            return False
        try:
            self._session.delete(action)
            self._session.commit()
            return True
        except SQLAlchemyError as error:
            self._session.rollback()
            raise CorrectiveActionRepositoryError("Failed to delete corrective action.") from error

