from __future__ import annotations

from datetime import datetime, timezone
from uuid import NAMESPACE_URL, UUID, uuid5

from app.db.models import Alert, EnergyWastageEvent, Machine
from app.repositories.alert_repository import AlertNotFoundError, AlertRepository
from app.schemas.alert import AlertListResponse, AlertResponse

_RECOMMENDATIONS = {
    "IDLE_WASTAGE": (
        "Inspect whether the machine remains energized while idle and whether the shutdown procedure permits stopping it."
    ),
    "LOW_LOAD_WASTAGE": (
        "Review whether the equipment is appropriately sized or operating below its intended load."
    ),
    "ABNORMAL_POWER": (
        "Inspect load conditions, electrical measurements, and machine operating context."
    ),
    "START_STOP_CYCLING": (
        "Review operating schedules, control logic, and repeated start/stop behavior."
    ),
}

_DEFAULT_RECOMMENDATION = (
    "Inspect machine operating conditions, electrical telemetry, and control settings."
)


def get_recommendation_for_reason(reason_str: str) -> str:
    upper = (reason_str or "").upper()
    for key, rec in _RECOMMENDATIONS.items():
        if key in upper:
            return rec
    return _DEFAULT_RECOMMENDATION


def map_event_to_alert_attributes(
    event: EnergyWastageEvent,
    machine_name: str | None = None,
) -> tuple[str, str, str, str, str]:
    """Derive (alert_type, severity, title, description, recommendation) from an EnergyWastageEvent."""
    name = machine_name or str(event.machine_id)[:8]
    reason = event.detection_reason or "UNKNOWN"
    primary_reason = reason.split(";")[0].strip().upper()

    duration_sec = event.duration_seconds or 0.0
    duration_min = max(0.1, duration_sec / 60.0)
    wasted_kwh = float(event.estimated_wasted_energy_kwh) if event.estimated_wasted_energy_kwh is not None else None

    # Severity and text mapping
    if "START_STOP_CYCLING" in primary_reason:
        alert_type = "START_STOP_CYCLING"
        severity = "medium" if duration_min >= 10.0 else "low"
        title = "Repeated Start/Stop Cycling Candidate"
        description = (
            f"Machine '{name}' exhibited rapid start/stop cycling behavior over {duration_min:.1f} minutes. "
            "Start/stop cycling represents mechanical and thermal stress; wasted energy is not estimated."
        )
    elif "IDLE_WASTAGE" in primary_reason:
        alert_type = "IDLE_WASTAGE"
        wasted_val = wasted_kwh or 0.0
        if wasted_val >= 5.0:
            severity = "high"
        elif wasted_val >= 1.0:
            severity = "medium"
        else:
            severity = "low"
        title = "Sustained Idle Energy Wastage"
        description = (
            f"Machine '{name}' operated in IDLE state for {duration_min:.1f} minutes, "
            f"consuming an estimated {wasted_val:.2f} kWh of unnecessary energy."
        )
    elif "LOW_LOAD_WASTAGE" in primary_reason:
        alert_type = "LOW_LOAD_WASTAGE"
        wasted_val = wasted_kwh or 0.0
        if wasted_val >= 5.0:
            severity = "high"
        elif wasted_val >= 1.0:
            severity = "medium"
        else:
            severity = "low"
        title = "Low Load Inefficient Operation"
        description = (
            f"Machine '{name}' operated below minimum efficient loading for {duration_min:.1f} minutes "
            f"(estimated {wasted_val:.2f} kWh excess energy above benchmark)."
        )
    elif "ABNORMAL_POWER" in primary_reason:
        alert_type = "ABNORMAL_POWER"
        wasted_val = wasted_kwh or 0.0
        if wasted_val >= 5.0:
            severity = "high"
        elif wasted_val >= 1.0:
            severity = "medium"
        else:
            severity = "low"
        title = "Abnormal Power Consumption"
        description = (
            f"Machine '{name}' exhibited active power consumption exceeding baseline curve "
            f"for {duration_min:.1f} minutes (estimated {wasted_val:.2f} kWh excess)."
        )
    else:
        alert_type = primary_reason
        severity = "medium"
        title = f"Energy Anomaly: {primary_reason}"
        description = f"Machine '{name}' triggered {primary_reason} for {duration_min:.1f} minutes."

    recommendation = get_recommendation_for_reason(primary_reason)
    return alert_type, severity, title, description, recommendation


class AlertService:
    def __init__(self, repository: AlertRepository) -> None:
        self._repo = repository

    def create_or_get_for_event(
        self,
        event: EnergyWastageEvent,
        machine: Machine | None = None,
    ) -> tuple[Alert, bool]:
        """Idempotently creates an Alert for a persisted EnergyWastageEvent."""
        machine_name = machine.name if machine is not None else None
        alert_type, severity, title, description, _ = map_event_to_alert_attributes(
            event, machine_name=machine_name
        )

        deterministic_id = uuid5(NAMESPACE_URL, f"orvex:alert:{event.id}")
        occurred_at = (
            event.start_time
            if event.start_time.tzinfo is not None
            else event.start_time.replace(tzinfo=timezone.utc)
        )

        alert_record = Alert(
            id=deterministic_id,
            machine_id=event.machine_id,
            event_id=event.id,
            title=title,
            alert_type=alert_type,
            severity=severity,
            occurred_at=occurred_at,
            description=description,
            status="open",
            resolved_at=None,
        )

        return self._repo.create_or_get_for_event(alert_record)

    def get_alert_by_id(self, alert_id: UUID) -> AlertResponse:
        alert = self._repo.get_by_id(alert_id)
        if alert is None:
            raise AlertNotFoundError(f"Alert with ID {alert_id} not found.")
        return self._map_to_response(alert)

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
    ) -> AlertListResponse:
        items, total = self._repo.list_alerts(
            machine_id=machine_id,
            severity=severity,
            alert_type=alert_type,
            status=status,
            start_time=start_time,
            end_time=end_time,
            limit=limit,
            offset=offset,
        )
        return AlertListResponse(
            items=[self._map_to_response(a) for a in items],
            total=total,
            limit=limit,
            offset=offset,
        )

    def acknowledge_alert(self, alert_id: UUID) -> AlertResponse:
        alert = self._repo.get_by_id(alert_id)
        if alert is None:
            raise AlertNotFoundError(f"Alert with ID {alert_id} not found.")

        # If already acknowledged or resolved, return as is
        if alert.status == "open":
            updated = self._repo.update_status(alert_id, "acknowledged", resolved_at=None)
            if updated is not None:
                alert = updated

        return self._map_to_response(alert)

    def resolve_alert(self, alert_id: UUID) -> AlertResponse:
        alert = self._repo.get_by_id(alert_id)
        if alert is None:
            raise AlertNotFoundError(f"Alert with ID {alert_id} not found.")

        now_utc = datetime.now(timezone.utc)
        updated = self._repo.update_status(alert_id, "resolved", resolved_at=now_utc)
        if updated is not None:
            alert = updated

        return self._map_to_response(alert)

    def dismiss_alert(self, alert_id: UUID) -> AlertResponse:
        alert = self._repo.get_by_id(alert_id)
        if alert is None:
            raise AlertNotFoundError(f"Alert with ID {alert_id} not found.")

        updated = self._repo.update_status(alert_id, "dismissed", resolved_at=None)
        if updated is not None:
            alert = updated

        return self._map_to_response(alert)

    @staticmethod
    def _map_to_response(alert: Alert) -> AlertResponse:
        machine = alert.machine
        recommendation = get_recommendation_for_reason(alert.alert_type)
        return AlertResponse(
            id=alert.id,
            machine_id=alert.machine_id,
            machine_identifier=machine.machine_identifier if machine else None,
            machine_name=machine.name if machine else None,
            event_id=alert.event_id,
            alert_type=alert.alert_type,
            severity=alert.severity,
            title=alert.title or alert.alert_type,
            description=alert.description,
            recommendation=recommendation,
            status=alert.status,
            occurred_at=alert.occurred_at,
            resolved_at=alert.resolved_at,
            created_at=alert.created_at,
        )

