from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db.dependencies import get_db_session
from app.repositories.telemetry_repository import TelemetryRepository
from app.repositories.wastage_event_repository import WastageEventRepository
from app.schemas.telemetry import TelemetryCreate, TelemetryIngested
from app.services.analytics_orchestrator import AnalyticsOrchestrator
from app.services.telemetry_service import TelemetryService
from app.services.wastage_event_service import WastageEventService

router = APIRouter()


def get_telemetry_service(session: Session = Depends(get_db_session)) -> TelemetryService:
    telemetry_repo = TelemetryRepository(session)
    wastage_repo = WastageEventRepository(session)
    wastage_service = WastageEventService(wastage_repo)
    orchestrator = AnalyticsOrchestrator(
        session=session,
        persistence_service=wastage_service,
    )
    return TelemetryService(telemetry_repo, orchestrator=orchestrator)


@router.post(
    "/telemetry",
    response_model=TelemetryIngested,
    status_code=status.HTTP_201_CREATED,
)
def ingest_telemetry(
    telemetry: TelemetryCreate,
    service: TelemetryService = Depends(get_telemetry_service),
) -> TelemetryIngested:
    record = service.ingest(telemetry)
    return TelemetryIngested(id=record.id, timestamp=record.timestamp)