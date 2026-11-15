from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.models import Telemetry
from app.schemas.telemetry import TelemetryCreate


class TelemetryRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def create(self, telemetry: TelemetryCreate) -> Telemetry:
        values = telemetry.model_dump()
        values["load_percentage"] = values.pop("load_percent")
        record = Telemetry(**values)
        self._session.add(record)
        try:
            self._session.commit()
            self._session.refresh(record)
        except SQLAlchemyError:
            self._session.rollback()
            raise
        return record

    def get_latest(self, machine_id: UUID) -> Telemetry | None:
        return self._session.scalar(
            select(Telemetry)
            .where(Telemetry.machine_id == machine_id)
            .order_by(Telemetry.timestamp.desc(), Telemetry.id.desc())
            .limit(1)
        )

    def get_range(
        self,
        machine_id: UUID,
        *,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[Telemetry], int]:
        query = select(Telemetry).where(Telemetry.machine_id == machine_id)
        count_query = select(func.count()).select_from(Telemetry).where(Telemetry.machine_id == machine_id)

        if start_time is not None:
            query = query.where(Telemetry.timestamp >= start_time)
            count_query = count_query.where(Telemetry.timestamp >= start_time)
        if end_time is not None:
            query = query.where(Telemetry.timestamp <= end_time)
            count_query = count_query.where(Telemetry.timestamp <= end_time)

        total = self._session.scalar(count_query) or 0
        items = list(
            self._session.scalars(
                query.order_by(Telemetry.timestamp.asc(), Telemetry.id.asc())
                .limit(limit)
                .offset(offset)
            ).all()
        )
        return items, total

    def get_all_in_range(
        self,
        machine_id: UUID,
        start_time: datetime,
        end_time: datetime,
        *,
        max_records: int = 50000,
    ) -> list[Telemetry]:
        stmt = (
            select(Telemetry)
            .where(
                Telemetry.machine_id == machine_id,
                Telemetry.timestamp >= start_time,
                Telemetry.timestamp <= end_time,
            )
            .order_by(Telemetry.timestamp.asc(), Telemetry.id.asc())
            .limit(max_records)
        )
        return list(self._session.scalars(stmt).all())