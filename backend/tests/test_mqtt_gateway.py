from __future__ import annotations

import json
from unittest.mock import MagicMock, patch
from uuid import UUID, uuid4

import paho.mqtt.client as mqtt
import pytest
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.models import Machine
from app.gateway.mqtt_client import MqttGateway
from app.schemas.telemetry import TelemetryCreate
from app.services.telemetry_service import TelemetryService


@pytest.fixture
def test_settings() -> Settings:
    return Settings(
        database_url="postgresql://mock",
        mqtt_enabled=True,
        mqtt_host="localhost",
        mqtt_port=1883,
        mqtt_username=None,
        mqtt_password=None,
        mqtt_topic_prefix="orvex",
        mqtt_client_id="test-gateway-client",
        mqtt_keepalive=60,
        mqtt_reconnect_interval_seconds=1.0,
        mqtt_tls_enabled=False,
        mqtt_tls_ca_cert=None,
        mqtt_max_payload_bytes=1024,
    )


@pytest.fixture
def mock_session_and_service():
    session = MagicMock(spec=Session)
    telemetry_service = MagicMock(spec=TelemetryService)

    # Machine exists
    machine = MagicMock(spec=Machine)
    session.get.return_value = machine

    session_factory = MagicMock(return_value=session)
    telemetry_service_factory = MagicMock(return_value=telemetry_service)

    return session_factory, telemetry_service_factory, session, telemetry_service


class TestMqttGateway:
    def test_disabled_gateway_does_not_start(self, test_settings: Settings) -> None:
        disabled_settings = Settings(
            database_url=test_settings.database_url,
            mqtt_enabled=False,
            mqtt_host=test_settings.mqtt_host,
            mqtt_port=test_settings.mqtt_port,
            mqtt_username=None,
            mqtt_password=None,
            mqtt_topic_prefix="orvex",
            mqtt_client_id="test",
            mqtt_keepalive=60,
            mqtt_reconnect_interval_seconds=1.0,
            mqtt_tls_enabled=False,
            mqtt_tls_ca_cert=None,
            mqtt_max_payload_bytes=1024,
        )

        gateway = MqttGateway(session_factory=None, settings=disabled_settings)
        gateway.start()

        assert not gateway.is_running
        assert not gateway.is_connected
        status = gateway.get_status()
        assert status["enabled"] is False
        assert status["running"] is False

    @patch("paho.mqtt.client.Client")
    def test_start_and_stop_lifecycle(self, mock_client_cls, test_settings: Settings) -> None:
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client

        gateway = MqttGateway(session_factory=None, settings=test_settings)
        gateway.start()

        assert gateway.is_running
        mock_client.connect_async.assert_called_once_with("localhost", 1883, keepalive=60)
        mock_client.loop_start.assert_called_once()

        gateway.stop()
        assert not gateway.is_running
        mock_client.loop_stop.assert_called_once()
        mock_client.disconnect.assert_called_once()

    def test_successful_direct_message_ingestion(
        self, test_settings: Settings, mock_session_and_service
    ) -> None:
        session_factory, service_factory, session, telemetry_service = mock_session_and_service
        gateway = MqttGateway(
            session_factory=session_factory,
            settings=test_settings,
            telemetry_service_factory=service_factory,
        )

        machine_id = uuid4()
        topic = f"orvex/v1/machines/{machine_id}/telemetry"
        payload = {
            "timestamp": "2026-10-30T10:00:00Z",
            "voltage": 415.0,
            "active_power": 18.5,
        }
        payload_bytes = json.dumps(payload).encode("utf-8")

        success = gateway.process_message_direct(topic, payload_bytes)

        assert success is True
        assert telemetry_service.ingest.called
        telemetry_arg = telemetry_service.ingest.call_args[0][0]
        assert isinstance(telemetry_arg, TelemetryCreate)
        assert telemetry_arg.machine_id == machine_id
        assert telemetry_arg.active_power == 18.5

        status = gateway.get_status()
        assert status["messages_received"] == 1
        assert status["messages_ingested"] == 1
        assert status["messages_rejected"] == 0

    def test_unrelated_topic_safely_ignored(
        self, test_settings: Settings, mock_session_and_service
    ) -> None:
        session_factory, service_factory, session, telemetry_service = mock_session_and_service
        gateway = MqttGateway(
            session_factory=session_factory,
            settings=test_settings,
            telemetry_service_factory=service_factory,
        )

        success = gateway.process_message_direct("$SYS/broker/uptime", b"12345")
        assert success is False
        assert not telemetry_service.ingest.called

        status = gateway.get_status()
        assert status["messages_received"] == 1
        assert status["messages_ingested"] == 0
        assert status["messages_rejected"] == 0

    def test_malformed_topic_rejected(
        self, test_settings: Settings, mock_session_and_service
    ) -> None:
        session_factory, service_factory, session, telemetry_service = mock_session_and_service
        gateway = MqttGateway(
            session_factory=session_factory,
            settings=test_settings,
            telemetry_service_factory=service_factory,
        )

        with pytest.raises(Exception):
            gateway.process_message_direct("orvex/v1/bad-topic", b'{"timestamp":"2026-10-30T10:00:00Z"}')

        assert not telemetry_service.ingest.called
        status = gateway.get_status()
        assert status["messages_received"] == 1
        assert status["messages_ingested"] == 0
        assert status["messages_rejected"] == 1

    def test_malformed_payload_rejected(
        self, test_settings: Settings, mock_session_and_service
    ) -> None:
        session_factory, service_factory, session, telemetry_service = mock_session_and_service
        gateway = MqttGateway(
            session_factory=session_factory,
            settings=test_settings,
            telemetry_service_factory=service_factory,
        )

        machine_id = uuid4()
        topic = f"orvex/v1/machines/{machine_id}/telemetry"

        with pytest.raises(Exception):
            gateway.process_message_direct(topic, b"not valid json")

        assert not telemetry_service.ingest.called
        status = gateway.get_status()
        assert status["messages_rejected"] == 1

    def test_machine_mismatch_rejected(
        self, test_settings: Settings, mock_session_and_service
    ) -> None:
        session_factory, service_factory, session, telemetry_service = mock_session_and_service
        gateway = MqttGateway(
            session_factory=session_factory,
            settings=test_settings,
            telemetry_service_factory=service_factory,
        )

        topic_machine_id = uuid4()
        payload_machine_id = uuid4()
        topic = f"orvex/v1/machines/{topic_machine_id}/telemetry"
        payload = {
            "machine_id": str(payload_machine_id),
            "timestamp": "2026-10-30T10:00:00Z",
            "active_power": 10.0,
        }

        with pytest.raises(Exception):
            gateway.process_message_direct(topic, json.dumps(payload).encode("utf-8"))

        assert not telemetry_service.ingest.called
        status = gateway.get_status()
        assert status["messages_rejected"] == 1

    def test_database_error_rolls_back_and_increments_rejected(
        self, test_settings: Settings, mock_session_and_service
    ) -> None:
        session_factory, service_factory, session, telemetry_service = mock_session_and_service
        telemetry_service.ingest.side_effect = SQLAlchemyError("DB lock error")

        gateway = MqttGateway(
            session_factory=session_factory,
            settings=test_settings,
            telemetry_service_factory=service_factory,
        )

        machine_id = uuid4()
        topic = f"orvex/v1/machines/{machine_id}/telemetry"
        payload = {"timestamp": "2026-10-30T10:00:00Z", "active_power": 10.0}

        with pytest.raises(Exception):
            gateway.process_message_direct(topic, json.dumps(payload).encode("utf-8"))

        session.rollback.assert_called_once()
        status = gateway.get_status()
        assert status["messages_rejected"] == 1

    def test_on_message_callback_catches_errors_without_crashing(
        self, test_settings: Settings, mock_session_and_service
    ) -> None:
        session_factory, service_factory, session, telemetry_service = mock_session_and_service
        gateway = MqttGateway(
            session_factory=session_factory,
            settings=test_settings,
            telemetry_service_factory=service_factory,
        )

        mock_msg = MagicMock(spec=mqtt.MQTTMessage)
        mock_msg.topic = "orvex/v1/machines/invalid-uuid/telemetry"
        mock_msg.payload = b'{"timestamp":"2026-10-30T10:00:00Z"}'

        # Should log warning, increment rejected, and NOT throw an exception
        gateway._on_message(MagicMock(), None, mock_msg)

        status = gateway.get_status()
        assert status["messages_received"] == 1
        assert status["messages_rejected"] == 1
        assert status["messages_ingested"] == 0

    def test_connection_callbacks_update_state(self, test_settings: Settings) -> None:
        gateway = MqttGateway(session_factory=None, settings=test_settings)

        mock_client = MagicMock()
        mock_rc = MagicMock()
        mock_rc.is_failure = False

        # On connect
        gateway._on_connect(mock_client, None, None, mock_rc)
        assert gateway.is_connected
        mock_client.subscribe.assert_called_once_with("orvex/v1/machines/+/telemetry", qos=1)

        # On disconnect
        gateway._on_disconnect(mock_client, None, None, 0)
        assert not gateway.is_connected

