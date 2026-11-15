from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Sequence
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from analytics.config import DEFAULT_BASELINE, DetectionConfig, PiecewisePowerBaseline
from analytics.detectors.detector import DetectionEngine
from analytics.models import (
    DetectionEvent,
    DetectionReason,
    OperatingState,
    TelemetryInput,
)
from analytics.services.feature_engine import FeatureEngine
from app.db.models import Machine, Telemetry
from app.repositories.alert_repository import AlertRepository
from app.repositories.wastage_event_repository import WastageEventRepository
from app.services.alert_service import AlertService
from app.services.wastage_event_service import (
    PersistedDetectionEvent,
    WastageEventService,
)

logger = logging.getLogger(__name__)


class OrchestrationError(RuntimeError):
    """Raised when an error occurs during analytics orchestration."""


@dataclass(frozen=True, slots=True)
class OrchestrationResult:
    machine_id: UUID
    telemetry_count: int
    features_count: int
    candidates_count: int
    finalized_count: int
    persisted_events: tuple[PersistedDetectionEvent, ...]
    success: bool
    error: str | None = None


def telemetry_row_to_input(row: Telemetry) -> TelemetryInput:
    """Map an existing SQLAlchemy Telemetry model instance to TelemetryInput."""
    return TelemetryInput(
        timestamp=row.timestamp,
        machine_id=row.machine_id,
        sensor_id=row.sensor_id,
        voltage=row.voltage,
        current=row.current,
        active_power=row.active_power,
        reactive_power=row.reactive_power,
        apparent_power=row.apparent_power,
        power_factor=row.power_factor,
        cumulative_energy=row.cumulative_energy,
        rpm=row.rpm,
        temperature=row.temperature,
        load_percent=row.load_percentage,
        operating_state=row.operating_state,
    )


class AnalyticsOrchestrator:
    """Orchestrates historical telemetry retrieval, feature calculation, detection, and event persistence."""

    def __init__(
        self,
        session: Session,
        persistence_service: WastageEventService | None = None,
        alert_service: AlertService | None = None,
        feature_engine: FeatureEngine | None = None,
        detection_engine: DetectionEngine | None = None,
        history_window_seconds: float = 900.0,
        config: DetectionConfig | None = None,
    ) -> None:
        self._session = session
        self._config = config or DetectionConfig()
        self._persistence_service = persistence_service or WastageEventService(
            WastageEventRepository(session)
        )
        self._alert_service = alert_service or AlertService(AlertRepository(session))
        self._feature_engine_explicit = feature_engine is not None
        self._feature_engine = feature_engine or FeatureEngine(DEFAULT_BASELINE)
        self._detection_engine = detection_engine or DetectionEngine(self._config)
        self._history_window_seconds = history_window_seconds

    def process_machine(
        self,
        machine_id: UUID,
        *,
        finalize_ongoing: bool = False,
        raise_on_error: bool = False,
    ) -> OrchestrationResult:
        """Process bounded telemetry history for the machine and persist finalized detection events."""
        try:
            # 1. Retrieve bounded telemetry history
            records = self._retrieve_telemetry_history(machine_id)
            if not records:
                return OrchestrationResult(
                    machine_id=machine_id,
                    telemetry_count=0,
                    features_count=0,
                    candidates_count=0,
                    finalized_count=0,
                    persisted_events=(),
                    success=True,
                )

            latest_record = records[-1]
            latest_time = latest_record.timestamp.astimezone(timezone.utc)
            latest_state = latest_record.operating_state

            # 2. Compute features using machine-tailored or default FeatureEngine
            feature_engine = self._feature_engine
            if not self._feature_engine_explicit:
                try:
                    machine = self._session.get(Machine, machine_id)
                    if isinstance(machine, Machine) and machine.rated_power_kw is not None:
                        rated = float(machine.rated_power_kw)
                        if rated > 0:
                            baseline = PiecewisePowerBaseline(
                                rated_power_kw=rated,
                                idle_power_kw=DEFAULT_BASELINE.idle_power_kw * (rated / DEFAULT_BASELINE.rated_power_kw),
                            )
                            feature_engine = FeatureEngine(baseline)
                except Exception:
                    pass

            inputs = tuple(telemetry_row_to_input(record) for record in records)
            features = tuple(feature_engine.process(item) for item in inputs)

            # 3. Detect wastage candidates using existing DetectionEngine
            candidates = self._detection_engine.process(features)

            # 4. Filter for finalized candidates based on explicit finalization policy
            finalized_candidates: list[DetectionEvent] = []
            for candidate in candidates:
                if self._is_finalized(
                    candidate,
                    latest_time=latest_time,
                    latest_state=latest_state,
                    finalize_ongoing=finalize_ongoing,
                ):
                    finalized_candidates.append(candidate)

            # 5. Persist finalized events through Stage 3C persistence service
            persisted = self._persistence_service.persist_many(finalized_candidates)

            # 6. Generate in-app alerts for finalized events (Stage 5A)
            machine_entity = None
            try:
                machine_entity = self._session.get(Machine, machine_id)
            except Exception:
                pass

            for item in persisted:
                try:
                    self._alert_service.create_or_get_for_event(
                        item.database_event, machine=machine_entity
                    )
                except Exception as alert_err:
                    logger.warning(
                        "Alert generation failed for event %s on machine %s: %s",
                        item.database_event.id,
                        machine_id,
                        alert_err,
                    )

            return OrchestrationResult(
                machine_id=machine_id,
                telemetry_count=len(records),
                features_count=len(features),
                candidates_count=len(candidates),
                finalized_count=len(finalized_candidates),
                persisted_events=persisted,
                success=True,
            )

        except Exception as error:
            self._session.rollback()
            logger.exception(
                "Analytics orchestration failed for machine %s: %s",
                machine_id,
                error,
            )
            if raise_on_error:
                raise OrchestrationError(
                    f"Analytics orchestration failed for machine {machine_id}: {error}"
                ) from error
            return OrchestrationResult(
                machine_id=machine_id,
                telemetry_count=0,
                features_count=0,
                candidates_count=0,
                finalized_count=0,
                persisted_events=(),
                success=False,
                error=str(error),
            )

    def flush_machine(
        self,
        machine_id: UUID,
        *,
        raise_on_error: bool = False,
    ) -> OrchestrationResult:
        """Finalize and persist any active candidates at the conclusion of a batch/stream."""
        return self.process_machine(
            machine_id,
            finalize_ongoing=True,
            raise_on_error=raise_on_error,
        )

    def _retrieve_telemetry_history(self, machine_id: UUID) -> tuple[Telemetry, ...]:
        """Query bounded telemetry history ordered ascending by timestamp."""
        latest_time = self._session.scalar(
            select(func.max(Telemetry.timestamp)).where(Telemetry.machine_id == machine_id)
        )
        if latest_time is None:
            return ()

        cutoff = latest_time - timedelta(seconds=self._history_window_seconds)
        stmt = (
            select(Telemetry)
            .where(
                Telemetry.machine_id == machine_id,
                Telemetry.timestamp >= cutoff,
                Telemetry.timestamp <= latest_time,
            )
            .order_by(Telemetry.timestamp.asc(), Telemetry.id.asc())
        )
        return tuple(self._session.scalars(stmt).all())

    def _is_finalized(
        self,
        candidate: DetectionEvent,
        *,
        latest_time: datetime,
        latest_state: str | None,
        finalize_ongoing: bool,
    ) -> bool:
        """Determine whether a candidate event has completed or is still developing."""
        if finalize_ongoing:
            return True

        cand_end = (
            candidate.end_time
            if candidate.end_time.tzinfo is not None
            else candidate.end_time.replace(tzinfo=timezone.utc)
        )
        curr_latest = (
            latest_time
            if latest_time.tzinfo is not None
            else latest_time.replace(tzinfo=timezone.utc)
        )

        # 1. Condition ended: A subsequent sample exists after the event's end time
        if cand_end < curr_latest:
            return True

        # 2. Machine shutdown: The latest telemetry record indicates the machine is stopped
        if latest_state is not None and latest_state.upper() == OperatingState.STOPPED.value:
            return True

        # 3. Telemetry gap: Elapsed time since end_time exceeds maximum gap threshold
        if (curr_latest - cand_end).total_seconds() > self._config.maximum_sample_gap_seconds:
            return True

        return False
