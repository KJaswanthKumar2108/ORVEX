from collections.abc import Iterable
from dataclasses import dataclass
from datetime import timezone
from decimal import Decimal
from math import isfinite
from uuid import UUID

from app.db.models import EnergyWastageEvent
from app.repositories.wastage_event_repository import (
    RepositoryPersistResult,
    WastageEventIdentityConflict,
    WastageEventPersistenceError,
    WastageEventRepository,
)
from analytics.models import (
    DetectionConfidence,
    DetectionEvent,
    DetectionReason,
    DetectionStatus,
    FeatureQuality,
)

_CONFIDENCE_SCORE = {
    DetectionConfidence.LOW: 0.33,
    DetectionConfidence.MEDIUM: 0.67,
    DetectionConfidence.HIGH: 1.0,
}


class InvalidDetectionEvent(ValueError):
    """Raised when a detection result cannot be represented by the existing schema."""


@dataclass(frozen=True, slots=True)
class PersistedDetectionEvent:
    detection_event: DetectionEvent
    database_event: EnergyWastageEvent
    created: bool


class WastageEventService:
    def __init__(self, repository: WastageEventRepository) -> None:
        self._repository = repository

    def persist(self, event: DetectionEvent) -> PersistedDetectionEvent:
        record = self._map_to_database_model(event)
        persist_func = getattr(self._repository, "create_or_update", self._repository.create_if_not_exists)
        result: RepositoryPersistResult = persist_func(record)
        return PersistedDetectionEvent(
            detection_event=event,
            database_event=result.record,
            created=result.created,
        )

    def persist_many(self, events: Iterable[DetectionEvent]) -> tuple[PersistedDetectionEvent, ...]:
        return tuple(self.persist(event) for event in events)

    @staticmethod
    def _map_to_database_model(event: DetectionEvent) -> EnergyWastageEvent:
        if not isinstance(event.event_id, UUID) or not isinstance(event.machine_id, UUID):
            raise InvalidDetectionEvent("event_id and machine_id must be UUID values")
        if not isinstance(event.primary_reason, DetectionReason):
            raise InvalidDetectionEvent("primary_reason must be a supported DetectionReason")
        if not isinstance(event.confidence, DetectionConfidence) or not isinstance(event.quality, FeatureQuality):
            raise InvalidDetectionEvent("confidence and quality must use supported analytics enums")
        if event.status is not DetectionStatus.CANDIDATE:
            raise InvalidDetectionEvent("only finalized detection candidates can be persisted")
        if event.start_time.tzinfo is None or event.start_time.utcoffset() is None:
            raise InvalidDetectionEvent("start_time must be timezone-aware")
        if event.end_time.tzinfo is None or event.end_time.utcoffset() is None:
            raise InvalidDetectionEvent("end_time must be timezone-aware")

        start_time = event.start_time.astimezone(timezone.utc)
        end_time = event.end_time.astimezone(timezone.utc)
        duration_seconds = (end_time - start_time).total_seconds()
        if duration_seconds < 0 or not isfinite(event.duration_seconds) or event.duration_seconds < 0:
            raise InvalidDetectionEvent("event duration and interval must be nonnegative and finite")
        if abs(duration_seconds - event.duration_seconds) > 1e-6:
            raise InvalidDetectionEvent("duration_seconds must match the start/end interval")

        actual_energy = event.actual_energy_consumed_kwh
        wasted_energy = event.estimated_wasted_energy_kwh
        if actual_energy is None or not isfinite(actual_energy) or actual_energy < 0:
            raise InvalidDetectionEvent("actual energy must be finite and nonnegative for the existing schema")
        if wasted_energy is not None:
            if not isfinite(wasted_energy) or wasted_energy < 0:
                raise InvalidDetectionEvent("estimated wasted energy must be null or finite and nonnegative")
            if wasted_energy > actual_energy and (wasted_energy - actual_energy) > 1e-6:
                raise InvalidDetectionEvent("estimated wasted energy cannot exceed actual energy")

        reasons = (event.primary_reason, *event.contributing_reasons)
        if any(not isinstance(reason, DetectionReason) for reason in reasons):
            raise InvalidDetectionEvent("contributing_reasons must use supported DetectionReason values")
        persisted_reason = event.primary_reason.value
        if event.contributing_reasons:
            contributors = ",".join(reason.value for reason in event.contributing_reasons)
            persisted_reason = f"{persisted_reason}; contributing={contributors}"

        actual_decimal = Decimal(f"{actual_energy:.4f}")
        wasted_decimal = (
            min(Decimal(f"{wasted_energy:.4f}"), actual_decimal)
            if wasted_energy is not None
            else None
        )

        return EnergyWastageEvent(
            id=event.event_id,
            machine_id=event.machine_id,
            start_time=start_time,
            end_time=end_time,
            estimated_energy_kwh=actual_decimal,
            estimated_wasted_energy_kwh=wasted_decimal,
            detection_reason=persisted_reason,
            confidence_score=_CONFIDENCE_SCORE[event.confidence],
            status="detected",
        )