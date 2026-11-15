from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest
from sqlalchemy.orm import Session

from app.db.models import Machine, Sensor
from app.gateway.telemetry_mapper import (
    InvalidMeasurementValueError,
    InvalidTimestampError,
    MachineIdentityMismatchError,
    MachineNotFoundError,
    SensorAssociationError,
    SensorNotFoundError,
    TelemetryMapper,
)


@pytest.fixture
def mock_session() -> MagicMock:
    session = MagicMock(spec=Session)

    m1_id = uuid4()
    m2_id = uuid4()
    s1_id = uuid4()

    m1 = Machine(
        id=m1_id,
        site_id=uuid4(),
        machine_identifier="TEST-M1",
        name="Test Machine 1",
        machine_type="conveyor",
        rated_power_kw=Decimal("100.0"),
    )
    m2 = Machine(
        id=m2_id,
        site_id=uuid4(),
        machine_identifier="TEST-M2",
        name="Test Machine 2",
        machine_type="pump",
        rated_power_kw=Decimal("50.0"),
    )
    s1 = Sensor(
        id=s1_id,
        machine_id=m1_id,
        sensor_identifier="SENS-01",
        sensor_type="power_meter",
        unit="kW",
    )

    def mock_get(entity_cls, entity_id):
        if entity_cls is Machine:
            if entity_id == m1_id:
                return m1
            if entity_id == m2_id:
                return m2
            return None
        if entity_cls is Sensor:
            if entity_id == s1_id:
                return s1
            return None
        return None

    session.get.side_effect = mock_get
    session.m1 = m1
    session.m2 = m2
    session.s1 = s1
    return session


class TestTelemetryMapper:
    def test_canonical_fields_mapping(self) -> None:
        mapper = TelemetryMapper()
        machine_id = uuid4()
        payload = {
            "timestamp": "2026-10-30T10:00:00Z",
            "voltage": 415.2,
            "current": 25.1,
            "active_power": 15.4,
            "reactive_power": 3.2,
            "apparent_power": 15.7,
            "power_factor": 0.98,
            "cumulative_energy": 540.2,
            "rpm": 1450.0,
            "temperature": 65.4,
            "load_percent": 75.0,
            "operating_state": "RUNNING",
        }

        result = mapper.map_payload(payload, authoritative_machine_id=machine_id, validate_db=False)

        assert result.machine_id == machine_id
        assert result.timestamp == datetime(2026, 10, 30, 10, 0, 0, tzinfo=timezone.utc)
        assert result.voltage == 415.2
        assert result.current == 25.1
        assert result.active_power == 15.4
        assert result.reactive_power == 3.2
        assert result.apparent_power == 15.7
        assert result.power_factor == 0.98
        assert result.cumulative_energy == 540.2
        assert result.rpm == 1450.0
        assert result.temperature == 65.4
        assert result.load_percent == 75.0
        assert result.operating_state == "RUNNING"

    def test_unit_suffixed_aliases_mapping(self) -> None:
        mapper = TelemetryMapper()
        machine_id = uuid4()
        payload = {
            "timestamp": "2026-10-30T10:15:00Z",
            "voltage_v": 400.0,
            "current_a": 10.0,
            "active_power_kw": 6.5,
            "reactive_power_kvar": 1.2,
            "apparent_power_kva": 6.6,
            "pf": 0.95,
            "cumulative_energy_kwh": 120.0,
            "temperature_c": 55.0,
            "load_percentage": 50.0,
        }

        result = mapper.map_payload(payload, authoritative_machine_id=machine_id, validate_db=False)

        assert result.voltage == 400.0
        assert result.current == 10.0
        assert result.active_power == 6.5
        assert result.reactive_power == 1.2
        assert result.apparent_power == 6.6
        assert result.power_factor == 0.95
        assert result.cumulative_energy == 120.0
        assert result.temperature == 55.0
        assert result.load_percent == 50.0

    def test_missing_optional_fields_preserved_as_none(self) -> None:
        mapper = TelemetryMapper()
        machine_id = uuid4()
        payload = {
            "timestamp": "2026-10-30T10:00:00Z",
            "active_power": 12.0,
        }

        result = mapper.map_payload(payload, authoritative_machine_id=machine_id, validate_db=False)

        assert result.active_power == 12.0
        assert result.voltage is None
        assert result.current is None
        assert result.rpm is None
        assert result.temperature is None
        assert result.load_percent is None
        assert result.operating_state is None

    def test_machine_identity_mismatch_rejected(self) -> None:
        mapper = TelemetryMapper()
        topic_machine_id = uuid4()
        payload_machine_id = uuid4()

        payload = {
            "timestamp": "2026-10-30T10:00:00Z",
            "machine_id": str(payload_machine_id),
            "active_power": 10.0,
        }

        with pytest.raises(MachineIdentityMismatchError, match="does not match authoritative topic"):
            mapper.map_payload(payload, authoritative_machine_id=topic_machine_id, validate_db=False)

    def test_matching_payload_machine_id_accepted(self) -> None:
        mapper = TelemetryMapper()
        machine_id = uuid4()
        payload = {
            "timestamp": "2026-10-30T10:00:00Z",
            "machine_id": str(machine_id),
            "active_power": 10.0,
        }

        result = mapper.map_payload(payload, authoritative_machine_id=machine_id, validate_db=False)
        assert result.machine_id == machine_id

    def test_nan_and_infinity_rejected(self) -> None:
        mapper = TelemetryMapper()
        machine_id = uuid4()

        with pytest.raises(InvalidMeasurementValueError, match="cannot be NaN or infinite"):
            mapper.map_payload(
                {"timestamp": "2026-10-30T10:00:00Z", "active_power": float("nan")},
                authoritative_machine_id=machine_id,
                validate_db=False,
            )

        with pytest.raises(InvalidMeasurementValueError, match="cannot be NaN or infinite"):
            mapper.map_payload(
                {"timestamp": "2026-10-30T10:00:00Z", "active_power": float("inf")},
                authoritative_machine_id=machine_id,
                validate_db=False,
            )

    def test_invalid_range_rejected(self) -> None:
        mapper = TelemetryMapper()
        machine_id = uuid4()

        # Negative voltage
        with pytest.raises(InvalidMeasurementValueError):
            mapper.map_payload(
                {"timestamp": "2026-10-30T10:00:00Z", "voltage": -10.0},
                authoritative_machine_id=machine_id,
                validate_db=False,
            )

        # Power factor > 1
        with pytest.raises(InvalidMeasurementValueError):
            mapper.map_payload(
                {"timestamp": "2026-10-30T10:00:00Z", "power_factor": 1.5},
                authoritative_machine_id=machine_id,
                validate_db=False,
            )

        # Load percent > 100
        with pytest.raises(InvalidMeasurementValueError):
            mapper.map_payload(
                {"timestamp": "2026-10-30T10:00:00Z", "load_percent": 150.0},
                authoritative_machine_id=machine_id,
                validate_db=False,
            )

    def test_timestamp_epoch_number_supported(self) -> None:
        mapper = TelemetryMapper()
        machine_id = uuid4()

        # Epoch seconds
        payload = {"timestamp": 1761825600.0, "active_power": 10.0}
        result = mapper.map_payload(payload, authoritative_machine_id=machine_id, validate_db=False)
        assert result.timestamp.tzinfo == timezone.utc

    def test_missing_or_invalid_timestamp_rejected(self) -> None:
        mapper = TelemetryMapper()
        machine_id = uuid4()

        with pytest.raises(InvalidTimestampError, match="missing required 'timestamp'"):
            mapper.map_payload({"active_power": 10.0}, authoritative_machine_id=machine_id, validate_db=False)

        with pytest.raises(InvalidTimestampError, match="Invalid ISO 8601"):
            mapper.map_payload({"timestamp": "not-a-timestamp", "active_power": 10.0}, authoritative_machine_id=machine_id, validate_db=False)

    def test_database_validation_unknown_machine_rejected(self, mock_session: MagicMock) -> None:
        mapper = TelemetryMapper(session=mock_session)
        unknown_m_id = uuid4()
        payload = {"timestamp": "2026-10-30T10:00:00Z", "active_power": 10.0}

        with pytest.raises(MachineNotFoundError, match="is not registered"):
            mapper.map_payload(payload, authoritative_machine_id=unknown_m_id, validate_db=True)

    def test_database_validation_sensor_association(self, mock_session: MagicMock) -> None:
        mapper = TelemetryMapper(session=mock_session)

        m1 = mock_session.m1
        m2 = mock_session.m2
        s1 = mock_session.s1

        # 1. Valid machine + matching sensor -> Success
        payload_ok = {
            "timestamp": "2026-10-30T10:00:00Z",
            "sensor_id": str(s1.id),
            "active_power": 10.0,
        }
        res = mapper.map_payload(payload_ok, authoritative_machine_id=m1.id, validate_db=True)
        assert res.sensor_id == s1.id

        # 2. Valid machine + sensor belonging to different machine -> SensorAssociationError
        payload_wrong_sensor = {
            "timestamp": "2026-10-30T10:00:00Z",
            "sensor_id": str(s1.id),
            "active_power": 10.0,
        }
        with pytest.raises(SensorAssociationError, match="belongs to machine"):
            mapper.map_payload(payload_wrong_sensor, authoritative_machine_id=m2.id, validate_db=True)

        # 3. Valid machine + unknown sensor ID -> SensorNotFoundError
        payload_unknown_sensor = {
            "timestamp": "2026-10-30T10:00:00Z",
            "sensor_id": str(uuid4()),
            "active_power": 10.0,
        }
        with pytest.raises(SensorNotFoundError, match="is not registered in the system"):
            mapper.map_payload(payload_unknown_sensor, authoritative_machine_id=m1.id, validate_db=True)
