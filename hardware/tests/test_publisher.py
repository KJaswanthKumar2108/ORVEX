from __future__ import annotations

import json
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from hardware.config import EdgeConfig
from hardware.publisher import EdgeMqttPublisher, EdgePublishError


@pytest.fixture
def edge_config() -> EdgeConfig:
    return EdgeConfig(
        mqtt_host="localhost",
        mqtt_port=1883,
        mqtt_username=None,
        mqtt_password=None,
        mqtt_topic_prefix="orvex",
        mqtt_client_id="test-edge-publisher",
        machine_id=uuid4(),
        sensor_id=None,
        adapter_type="mock",
        poll_interval_seconds=1.0,
        modbus_port="COM3",
        modbus_baudrate=9600,
        modbus_parity="N",
        modbus_stopbits=1,
        modbus_unit_id=1,
        modbus_timeout=1.0,
        rated_power_kw=100.0,
    )


class TestEdgeMqttPublisher:
    def test_validate_payload_valid(self, edge_config: EdgeConfig) -> None:
        publisher = EdgeMqttPublisher(edge_config)
        valid_payload = {
            "timestamp": "2026-10-30T10:00:00Z",
            "machine_id": str(edge_config.machine_id),
            "voltage": 415.0,
            "active_power": 45.2,
            "power_factor": 0.96,
        }
        # Should not raise
        publisher.validate_payload(valid_payload)

    def test_validate_payload_missing_timestamp(self, edge_config: EdgeConfig) -> None:
        publisher = EdgeMqttPublisher(edge_config)
        with pytest.raises(EdgePublishError, match="missing required 'timestamp'"):
            publisher.validate_payload({"machine_id": str(edge_config.machine_id)})

    def test_validate_payload_missing_machine_id(self, edge_config: EdgeConfig) -> None:
        publisher = EdgeMqttPublisher(edge_config)
        with pytest.raises(EdgePublishError, match="missing required 'machine_id'"):
            publisher.validate_payload({"timestamp": "2026-10-30T10:00:00Z"})

    def test_validate_payload_rejects_nan(self, edge_config: EdgeConfig) -> None:
        publisher = EdgeMqttPublisher(edge_config)
        payload = {
            "timestamp": "2026-10-30T10:00:00Z",
            "machine_id": str(edge_config.machine_id),
            "active_power": float("nan"),
        }
        with pytest.raises(EdgePublishError, match="cannot be NaN or infinite"):
            publisher.validate_payload(payload)

    def test_validate_payload_rejects_infinity(self, edge_config: EdgeConfig) -> None:
        publisher = EdgeMqttPublisher(edge_config)
        payload = {
            "timestamp": "2026-10-30T10:00:00Z",
            "machine_id": str(edge_config.machine_id),
            "voltage": float("inf"),
        }
        with pytest.raises(EdgePublishError, match="cannot be NaN or infinite"):
            publisher.validate_payload(payload)

    def test_validate_payload_rejects_out_of_range_pf(self, edge_config: EdgeConfig) -> None:
        publisher = EdgeMqttPublisher(edge_config)
        payload = {
            "timestamp": "2026-10-30T10:00:00Z",
            "machine_id": str(edge_config.machine_id),
            "power_factor": 1.25,
        }
        with pytest.raises(EdgePublishError, match="power_factor must be between -1.0 and 1.0"):
            publisher.validate_payload(payload)

    def test_publish_reading_success(self, edge_config: EdgeConfig) -> None:
        publisher = EdgeMqttPublisher(edge_config)
        mock_client = MagicMock()
        publisher._client = mock_client
        publisher._connected = True

        mock_info = MagicMock()
        mock_client.publish.return_value = mock_info

        payload = {
            "timestamp": "2026-10-30T10:00:00Z",
            "machine_id": str(edge_config.machine_id),
            "voltage": 415.0,
            "active_power": 50.0,
        }

        publisher.publish_reading(payload)
        expected_topic = f"orvex/v1/machines/{edge_config.machine_id}/telemetry"
        mock_client.publish.assert_called_once()
        args, kwargs = mock_client.publish.call_args
        assert args[0] == expected_topic
        assert kwargs["qos"] == 1
        sent_dict = json.loads(kwargs["payload"].decode("utf-8"))
        assert sent_dict["voltage"] == 415.0
        assert publisher.messages_sent == 1

