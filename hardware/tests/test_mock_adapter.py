from __future__ import annotations

import math
from uuid import uuid4

import pytest

from hardware.adapters.mock_adapter import MockSensorAdapter
from hardware.models import SensorConnectionStatus


class TestMockSensorAdapter:
    def test_connection_lifecycle(self) -> None:
        adapter = MockSensorAdapter()
        assert not adapter.is_connected
        assert adapter.get_health().status == SensorConnectionStatus.DISCONNECTED

        assert adapter.connect()
        assert adapter.is_connected
        assert adapter.get_health().status == SensorConnectionStatus.CONNECTED

        adapter.disconnect()
        assert not adapter.is_connected
        assert adapter.get_health().status == SensorConnectionStatus.DISCONNECTED

    def test_standard_readings_generation(self) -> None:
        adapter = MockSensorAdapter(
            nominal_voltage=415.0,
            nominal_current=20.0,
            nominal_power_factor=0.95,
            rated_power_kw=100.0,
        )
        adapter.connect()

        reading = adapter.read()
        assert reading.is_valid
        assert reading.error_message is None
        assert 400.0 <= reading.voltage <= 430.0
        assert 18.0 <= reading.current <= 22.0
        assert 0.90 <= reading.power_factor <= 1.0
        assert reading.active_power is not None
        assert reading.active_power > 0.0
        assert reading.cumulative_energy is not None
        assert reading.load_percent is not None
        assert reading.operating_state in {"IDLE", "LOW_LOAD", "RUNNING"}

        # Health tracking
        health = adapter.get_health()
        assert health.status == SensorConnectionStatus.CONNECTED
        assert health.successful_readings == 1
        assert health.failed_readings == 0

    def test_unmeasured_fields_remain_none(self) -> None:
        """Verify that optional unmeasured fields are explicitly None and never default to 0.0."""
        adapter = MockSensorAdapter(unmeasured_fields={"temperature", "rpm", "reactive_power"})
        adapter.connect()

        reading = adapter.read()
        assert reading.temperature is None
        assert reading.rpm is None
        assert reading.reactive_power is None
        # Other measured fields should be present
        assert reading.voltage is not None
        assert reading.active_power is not None

    def test_simulated_disconnection(self) -> None:
        adapter = MockSensorAdapter()
        adapter.connect()
        assert adapter.is_connected

        # Simulate cable cut / disconnection
        adapter.simulate_disconnection(True)
        assert not adapter.is_connected

        reading = adapter.read()
        assert not reading.is_valid
        assert "disconnected" in reading.error_message.lower()

        health = adapter.get_health()
        assert health.failed_readings >= 1
        assert health.status in {SensorConnectionStatus.DISCONNECTED, SensorConnectionStatus.DEGRADED}

        # Reconnect
        adapter.simulate_disconnection(False)
        assert adapter.is_connected
        reading2 = adapter.read()
        assert reading2.is_valid

    def test_simulated_communication_error(self) -> None:
        adapter = MockSensorAdapter()
        adapter.connect()

        adapter.simulate_comm_error(True)
        reading = adapter.read()
        assert not reading.is_valid
        assert "framing error" in reading.error_message.lower() or "crc" in reading.error_message.lower()

        adapter.simulate_comm_error(False)
        reading2 = adapter.read()
        assert reading2.is_valid

    def test_nan_injection(self) -> None:
        adapter = MockSensorAdapter()
        adapter.connect()

        adapter.inject_nan("active_power", "voltage")
        reading = adapter.read()
        assert math.isnan(reading.active_power)
        assert math.isnan(reading.voltage)

        adapter.clear_nan_injections()
        reading2 = adapter.read()
        assert not math.isnan(reading2.active_power)

    def test_out_of_range_injection(self) -> None:
        adapter = MockSensorAdapter()
        adapter.connect()

        adapter.inject_out_of_range("power_factor", 1.85)
        reading = adapter.read()
        assert reading.power_factor == 1.85

    def test_stale_data_simulation(self) -> None:
        adapter = MockSensorAdapter()
        adapter.connect()

        reading1 = adapter.read()
        adapter.simulate_stale(True)
        reading2 = adapter.read()
        assert reading1.timestamp == reading2.timestamp
        assert reading1.voltage == reading2.voltage

        adapter.simulate_stale(False)
        reading3 = adapter.read()
        assert reading3.timestamp > reading1.timestamp

    def test_to_telemetry_payload_mapping(self) -> None:
        adapter = MockSensorAdapter(unmeasured_fields={"temperature"})
        adapter.connect()

        reading = adapter.read()
        m_id = uuid4()
        s_id = uuid4()
        payload = reading.to_telemetry_payload(machine_id=m_id, sensor_id=s_id)

        assert payload["machine_id"] == str(m_id)
        assert payload["sensor_id"] == str(s_id)
        assert "voltage" in payload
        assert "active_power" in payload
        assert "temperature" not in payload  # Omitted when None

