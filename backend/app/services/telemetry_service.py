from __future__ import annotations

import logging

from app.db.models import Telemetry
from app.repositories.telemetry_repository import TelemetryRepository
from app.schemas.telemetry import TelemetryCreate
from app.services.analytics_orchestrator import AnalyticsOrchestrator

logger = logging.getLogger(__name__)


class TelemetryService:
    def __init__(
        self,
        repository: TelemetryRepository,
        orchestrator: AnalyticsOrchestrator | None = None,
    ) -> None:
        self._repository = repository
        self._orchestrator = orchestrator

    def ingest(self, telemetry: TelemetryCreate) -> Telemetry:
        record = self._repository.create(telemetry)
        if self._orchestrator is not None:
            try:
                self._orchestrator.process_machine(record.machine_id)
            except Exception as error:
                logger.exception(
                    "Analytics processing failed for machine %s after telemetry commit: %s",
                    record.machine_id,
                    error,
                )
        return record