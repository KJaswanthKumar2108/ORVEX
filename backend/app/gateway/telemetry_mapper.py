from __future__ import annotations

from datetime import datetime, timezone
import math
from typing import Any
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.db.models import Machine, Sensor
from app.gateway.message_parser import GatewayMessageError
from app.schemas.telemetry import TelemetryCreate


class TelemetryMappingError(GatewayMessageError):
    """Base error for mapping MQTT payloads to telemetry records."""


class MachineIdentityMismatchError(TelemetryMappingError):
    """Raised when the payload machine_id conflicts with the authoritative topic machine_id."""


class MachineNotFoundError(TelemetryMappingError):
    """Raised when the machine does not exist in the database."""


class SensorNotFoundError(TelemetryMappingError):
    """Raised when the specified sensor_id is not registered."""


class SensorAssociationError(TelemetryMappingError):
    """Raised when the sensor does not belong to the specified machine."""


class InvalidTimestampError(TelemetryMappingError):
    """Raised when the timestamp is missing, malformed, or lacks timezone info."""


class InvalidMeasurementValueError(TelemetryMappingError):
    """Raised when a measurement value is NaN, infinite, or out of allowable range."""


# Map of alternate hardware/unit field names to canonical TelemetryCreate field names
FIELD_ALIASES: dict[str, str] = {
    "voltage_v": "voltage",
    "current_a": "current",
    "active_power_kw": "active_power",
    "reactive_power_kvar": "reactive_power",
    "apparent_power_kva": "apparent_power",
    "pf": "power_factor",
    "cumulative_energy_kwh": "cumulative_energy",
    "temperature_c": "temperature",
    "load_percentage": "load_percent",
}


def _validate_finite_float(val: Any, field_name: str) -> float | None:
    if val is None:
        return None
    try:
        f_val = float(val)
    except (ValueError, TypeError) as err:
        raise InvalidMeasurementValueError(
            f"Field '{field_name}' must be a numeric value, got '{val}'."
        ) from err

    if math.isnan(f_val) or math.isinf(f_val):
        raise InvalidMeasurementValueError(
            f"Field '{field_name}' cannot be NaN or infinite (received {f_val})."
        )
    return f_val


class TelemetryMapper:
    """Validates and maps raw MQTT message payloads into strongly-typed TelemetryCreate models."""

    def __init__(self, session: Session | None = None) -> None:
        self._session = session

    def set_session(self, session: Session) -> None:
        self._session = session

    def validate_entities(self, machine_id: UUID, sensor_id: UUID | None = None) -> None:
        """Validate that the machine exists in the registry, and that sensor_id (if provided)

        belongs to this machine.
        """
        if self._session is None:
            return

        machine = self._session.get(Machine, machine_id)
        if machine is None:
            raise MachineNotFoundError(f"Machine with ID '{machine_id}' is not registered.")

        if sensor_id is not None:
            sensor = self._session.get(Sensor, sensor_id)
            if sensor is None:
                raise SensorNotFoundError(
                    f"Sensor with ID '{sensor_id}' is not registered in the system."
                )
            if sensor.machine_id != machine_id:
                raise SensorAssociationError(
                    f"Sensor '{sensor_id}' belongs to machine '{sensor.machine_id}', not '{machine_id}'."
                )

    def map_payload(
        self,
        payload: dict[str, Any],
        authoritative_machine_id: UUID,
        validate_db: bool = True,
    ) -> TelemetryCreate:
        """Map raw dictionary to TelemetryCreate, enforcing topic machine identity and validation.

        Args:
            payload: Parsed JSON payload dictionary.
            authoritative_machine_id: Machine UUID parsed from the MQTT topic.
            validate_db: Whether to check machine and sensor existence in the database.

        Returns:
            TelemetryCreate validated instance.
        """
        # 1. Machine identity validation
        if "machine_id" in payload and payload["machine_id"] is not None:
            payload_m_id_str = str(payload["machine_id"]).strip()
            try:
                payload_m_id = UUID(payload_m_id_str)
            except ValueError as err:
                raise MachineIdentityMismatchError(
                    f"Malformed machine_id in payload '{payload_m_id_str}'."
                ) from err

            if payload_m_id != authoritative_machine_id:
                raise MachineIdentityMismatchError(
                    f"Payload machine_id '{payload_m_id}' does not match authoritative topic machine_id '{authoritative_machine_id}'."
                )
        else:
            payload["machine_id"] = str(authoritative_machine_id)

        # 2. Sensor ID parsing
        sensor_id: UUID | None = None
        if "sensor_id" in payload and payload["sensor_id"] is not None:
            try:
                sensor_id = UUID(str(payload["sensor_id"]).strip())
            except ValueError as err:
                raise TelemetryMappingError(
                    f"Malformed sensor_id in payload: '{payload['sensor_id']}'."
                ) from err

        # 3. Database referential integrity check
        if validate_db and self._session is not None:
            self.validate_entities(authoritative_machine_id, sensor_id)

        # 4. Timestamp parsing and normalization
        raw_ts = payload.get("timestamp")
        if raw_ts is None:
            raise InvalidTimestampError("Payload missing required 'timestamp' field.")

        dt: datetime
        if isinstance(raw_ts, (int, float)):
            # Epoch timestamp in seconds or milliseconds
            epoch_sec = float(raw_ts)
            if epoch_sec > 1e11:  # Milliseconds
                epoch_sec /= 1000.0
            dt = datetime.fromtimestamp(epoch_sec, tz=timezone.utc)
        elif isinstance(raw_ts, str):
            ts_str = raw_ts.strip()
            if not ts_str:
                raise InvalidTimestampError("Timestamp cannot be an empty string.")
            try:
                # Handle 'Z' suffix
                if ts_str.endswith("Z"):
                    ts_str = ts_str[:-1] + "+00:00"
                dt = datetime.fromisoformat(ts_str)
            except (ValueError, TypeError) as err:
                raise InvalidTimestampError(
                    f"Invalid ISO 8601 timestamp format '{raw_ts}': {err}."
                ) from err
        elif isinstance(raw_ts, datetime):
            dt = raw_ts
        else:
            raise InvalidTimestampError(f"Unsupported timestamp type '{type(raw_ts).__name__}'.")

        if dt.tzinfo is None or dt.utcoffset() is None:
            raise InvalidTimestampError(
                f"Timestamp '{raw_ts}' must include timezone information (e.g., UTC / 'Z')."
            )
        dt_utc = dt.astimezone(timezone.utc)

        # 5. Extract and normalize measurement fields
        normalized: dict[str, Any] = {
            "timestamp": dt_utc,
            "machine_id": authoritative_machine_id,
            "sensor_id": sensor_id,
        }

        # Resolve field aliases
        candidate_data = dict(payload)
        for alias, target in FIELD_ALIASES.items():
            if alias in candidate_data and target not in candidate_data:
                candidate_data[target] = candidate_data.pop(alias)

        # Map optional numeric fields, checking for NaN/inf
        numeric_fields = [
            "voltage",
            "current",
            "active_power",
            "reactive_power",
            "apparent_power",
            "power_factor",
            "cumulative_energy",
            "rpm",
            "temperature",
            "load_percent",
        ]
        for field in numeric_fields:
            if field in candidate_data:
                normalized[field] = _validate_finite_float(candidate_data[field], field)
            else:
                normalized[field] = None

        # Operating state normalization
        op_state = candidate_data.get("operating_state")
        if op_state is not None:
            op_str = str(op_state).strip()
            normalized["operating_state"] = op_str if op_str else None
        else:
            normalized["operating_state"] = None

        # 6. Validate through canonical TelemetryCreate Pydantic schema
        try:
            return TelemetryCreate(**normalized)
        except ValidationError as err:
            raise InvalidMeasurementValueError(
                f"Telemetry validation failed: {err.errors()[0]['msg']} on {err.errors()[0]['loc']}."
            ) from err

