from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Machine, Telemetry
from app.schemas.machine import MachineSummaryResponse, TelemetryFreshness


class MachineRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_by_id(self, machine_id: UUID) -> Machine | None:
        return self._session.get(Machine, machine_id)

    def list_machines(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        status: str | None = None,
    ) -> tuple[list[Machine], int]:
        query = select(Machine)
        count_query = select(func.count()).select_from(Machine)

        if status is not None:
            query = query.where(Machine.status == status)
            count_query = count_query.where(Machine.status == status)

        total = self._session.scalar(count_query) or 0
        items = list(
            self._session.scalars(
                query.order_by(Machine.name.asc(), Machine.id.asc())
                .limit(limit)
                .offset(offset)
            ).all()
        )
        return items, total

    def get_summary(
        self,
        machine_id: UUID,
        *,
        fresh_threshold_seconds: float = 60.0,
    ) -> MachineSummaryResponse | None:
        machine = self.get_by_id(machine_id)
        if machine is None:
            return None

        latest_telemetry = self._session.scalar(
            select(Telemetry)
            .where(Telemetry.machine_id == machine_id)
            .order_by(Telemetry.timestamp.desc(), Telemetry.id.desc())
            .limit(1)
        )

        latest_ts: datetime | None = None
        latest_state: str | None = None
        latest_power: float | None = None
        latest_pf: float | None = None
        latest_temp: float | None = None
        latest_load: float | None = None
        seconds_ago: float | None = None
        freshness: TelemetryFreshness = TelemetryFreshness.MISSING

        if latest_telemetry is not None:
            latest_ts = latest_telemetry.timestamp
            latest_state = latest_telemetry.operating_state
            latest_power = latest_telemetry.active_power
            latest_pf = latest_telemetry.power_factor
            latest_temp = latest_telemetry.temperature
            latest_load = latest_telemetry.load_percentage

            now = datetime.now(timezone.utc)
            # Ensure latest_ts has tzinfo for difference calculation
            ts_aware = latest_ts if latest_ts.tzinfo is not None else latest_ts.replace(tzinfo=timezone.utc)
            diff = (now - ts_aware).total_seconds()
            seconds_ago = max(0.0, diff)

            if seconds_ago <= fresh_threshold_seconds:
                freshness = TelemetryFreshness.FRESH
            else:
                freshness = TelemetryFreshness.STALE

        return MachineSummaryResponse(
            machine_id=machine.id,
            site_id=machine.site_id,
            machine_identifier=machine.machine_identifier,
            name=machine.name,
            machine_type=machine.machine_type,
            status=machine.status,
            rated_power_kw=float(machine.rated_power_kw) if machine.rated_power_kw is not None else None,
            latest_telemetry_timestamp=latest_ts,
            latest_operating_state=latest_state,
            latest_active_power=latest_power,
            latest_power_factor=latest_pf,
            latest_temperature=latest_temp,
            latest_load_percentage=latest_load,
            telemetry_freshness=freshness,
            seconds_since_last_telemetry=seconds_ago,
        )
