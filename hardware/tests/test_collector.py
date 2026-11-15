from __future__ import annotations

from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from hardware.adapters.mock_adapter import MockSensorAdapter
from hardware.collector import HardwareCollectorDaemon
from hardware.config import EdgeConfig
from hardware.publisher import EdgeMqttPublisher, EdgePublishError


@pytest.fixture
def test_config() -> EdgeConfig:
    return EdgeConfig(
        mqtt_host="localhost",
        mqtt_port=1883,
        mqtt_username=None,
        mqtt_password=None,
        mqtt_topic_prefix="orvex",
        mqtt_client_id="test-daemon",
        machine_id=uuid4(),
        sensor_id=uuid4(),
        adapter_type="mock",
        poll_interval_seconds=1.0,
        modbus_port="COM3",
        modbus_baudrate=9600,
        modbus_parity="N",
        modbus_stopbits=1,
        modbus_unit_id=1,
        modbus_timeout=1.0,
        rated_power_kw=132.0,
    )


class TestHardwareCollectorDaemon:
    def test_collect_and_publish_once_success(self, test_config: EdgeConfig) -> None:
        adapter = MockSensorAdapter(rated_power_kw=132.0)
        adapter.connect()

        mock_publisher = MagicMock(spec=EdgeMqttPublisher)

        daemon = HardwareCollectorDaemon(
            config=test_config,
            adapter=adapter,
            publisher=mock_publisher,
        )

        success = daemon.collect_and_publish_once()
        assert success is True
        mock_publisher.publish_reading.assert_called_once()
        published_payload = mock_publisher.publish_reading.call_args[0][0]
        assert published_payload["machine_id"] == str(test_config.machine_id)
        assert published_payload["sensor_id"] == str(test_config.sensor_id)
        assert "voltage" in published_payload
        assert "active_power" in published_payload

    def test_collect_skips_invalid_readings(self, test_config: EdgeConfig) -> None:
        adapter = MockSensorAdapter()
        adapter.connect()
        # Simulate sensor disconnection / invalid reading
        adapter.simulate_disconnection(True)

        mock_publisher = MagicMock(spec=EdgeMqttPublisher)
        daemon = HardwareCollectorDaemon(
            config=test_config,
            adapter=adapter,
            publisher=mock_publisher,
        )

        success = daemon.collect_and_publish_once()
        assert success is False
        mock_publisher.publish_reading.assert_not_called()
        assert daemon._errors_count == 1

    def test_publish_failure_handled_gracefully(self, test_config: EdgeConfig) -> None:
        adapter = MockSensorAdapter()
        adapter.connect()

        mock_publisher = MagicMock(spec=EdgeMqttPublisher)
        mock_publisher.publish_reading.side_effect = EdgePublishError("MQTT broker disconnected")

        daemon = HardwareCollectorDaemon(
            config=test_config,
            adapter=adapter,
            publisher=mock_publisher,
        )

        success = daemon.collect_and_publish_once()
        assert success is False
        assert daemon._errors_count == 1

    def test_daemon_stop_lifecycle(self, test_config: EdgeConfig) -> None:
        adapter = MagicMock()
        publisher = MagicMock()
        daemon = HardwareCollectorDaemon(
            config=test_config,
            adapter=adapter,
            publisher=publisher,
        )
        daemon._running = True
        daemon.stop()

        assert not daemon.is_running
        adapter.disconnect.assert_called_once()
        publisher.disconnect.assert_called_once()

