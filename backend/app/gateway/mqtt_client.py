from __future__ import annotations

from datetime import datetime, timezone
import logging
import ssl
from typing import Any, Callable
from uuid import UUID

import paho.mqtt.client as mqtt
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.gateway.message_parser import GatewayMessageError, MessageParser
from app.gateway.telemetry_mapper import TelemetryMapper, TelemetryMappingError
from app.repositories.telemetry_repository import TelemetryRepository
from app.repositories.wastage_event_repository import WastageEventRepository
from app.services.analytics_orchestrator import AnalyticsOrchestrator
from app.services.telemetry_service import TelemetryService
from app.services.wastage_event_service import WastageEventService

logger = logging.getLogger(__name__)


class MqttGateway:
    """Industrial MQTT Gateway managing broker connection, subscription, payload validation,

    and forwarding to the existing ORVEX telemetry ingestion pipeline.
    """

    def __init__(
        self,
        session_factory: Callable[[], Session] | None,
        settings: Settings,
        telemetry_service_factory: Callable[[Session], TelemetryService] | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._settings = settings
        self._custom_telemetry_service_factory = telemetry_service_factory

        self._parser = MessageParser(
            topic_prefix=settings.mqtt_topic_prefix,
            max_payload_bytes=settings.mqtt_max_payload_bytes,
        )

        self._client: mqtt.Client | None = None
        self._is_running: bool = False
        self._is_connected: bool = False
        self._last_connected_at: datetime | None = None
        self._last_disconnected_at: datetime | None = None
        self._last_message_at: datetime | None = None

        self._messages_received: int = 0
        self._messages_ingested: int = 0
        self._messages_rejected: int = 0

        self._subscribed_topic = f"{self._settings.mqtt_topic_prefix}/v1/machines/+/telemetry"

    @property
    def is_connected(self) -> bool:
        return self._is_connected

    @property
    def is_running(self) -> bool:
        return self._is_running

    def get_status(self) -> dict[str, Any]:
        """Return diagnostic metrics and operational health of the MQTT gateway."""
        return {
            "enabled": self._settings.mqtt_enabled,
            "running": self._is_running,
            "connected": self._is_connected,
            "broker": f"{self._settings.mqtt_host}:{self._settings.mqtt_port}",
            "topic_prefix": self._settings.mqtt_topic_prefix,
            "subscribed_topic": self._subscribed_topic,
            "messages_received": self._messages_received,
            "messages_ingested": self._messages_ingested,
            "messages_rejected": self._messages_rejected,
            "last_connected_at": self._last_connected_at.isoformat() if self._last_connected_at else None,
            "last_disconnected_at": self._last_disconnected_at.isoformat() if self._last_disconnected_at else None,
            "last_message_at": self._last_message_at.isoformat() if self._last_message_at else None,
        }

    def _create_telemetry_service(self, session: Session) -> TelemetryService:
        if self._custom_telemetry_service_factory is not None:
            return self._custom_telemetry_service_factory(session)

        telemetry_repo = TelemetryRepository(session)
        wastage_repo = WastageEventRepository(session)
        wastage_service = WastageEventService(wastage_repo)
        orchestrator = AnalyticsOrchestrator(
            session=session,
            persistence_service=wastage_service,
        )
        return TelemetryService(telemetry_repo, orchestrator=orchestrator)

    def _on_connect(
        self,
        client: mqtt.Client,
        userdata: Any,
        flags: Any,
        reason_code: mqtt.ReasonCode,
        properties: Any = None,
    ) -> None:
        if reason_code.is_failure:
            self._is_connected = False
            logger.error("Failed to connect to MQTT broker: reason_code=%s", reason_code)
            return

        self._is_connected = True
        self._last_connected_at = datetime.now(timezone.utc)
        logger.info(
            "Connected to MQTT broker at %s:%d. Subscribing to '%s'",
            self._settings.mqtt_host,
            self._settings.mqtt_port,
            self._subscribed_topic,
        )
        client.subscribe(self._subscribed_topic, qos=1)

    def _on_disconnect(
        self,
        client: mqtt.Client,
        userdata: Any,
        disconnect_flags: Any,
        reason_code: mqtt.ReasonCode,
        properties: Any = None,
    ) -> None:
        self._is_connected = False
        self._last_disconnected_at = datetime.now(timezone.utc)
        if reason_code == 0:
            logger.info("Cleanly disconnected from MQTT broker.")
        else:
            logger.warning(
                "Disconnected unexpectedly from MQTT broker: reason_code=%s. Paho will auto-reconnect.",
                reason_code,
            )

    def _on_subscribe(
        self,
        client: mqtt.Client,
        userdata: Any,
        mid: int,
        reason_codes: list[mqtt.ReasonCode],
        properties: Any = None,
    ) -> None:
        logger.info("MQTT subscription confirmed for topic '%s' (mid=%d)", self._subscribed_topic, mid)

    def _on_message(self, client: mqtt.Client, userdata: Any, msg: mqtt.MQTTMessage) -> None:
        self._messages_received += 1
        self._last_message_at = datetime.now(timezone.utc)
        topic = msg.topic

        try:
            # 1. Parse and validate topic
            parsed_topic = self._parser.parse_topic(topic)
            if parsed_topic is None:
                # Unrelated topic, ignore safely
                return

            # 2. Parse and validate payload bytes as JSON
            payload_dict = self._parser.parse_payload(msg.payload)

            # 3. Ingest into database via existing TelemetryService pipeline
            self._process_payload(parsed_topic.machine_id, payload_dict)
            self._messages_ingested += 1

        except GatewayMessageError as err:
            self._messages_rejected += 1
            logger.warning("Rejected MQTT message on '%s': %s", topic, err)
        except Exception as err:
            self._messages_rejected += 1
            logger.exception("Unexpected error processing MQTT message on '%s': %s", topic, err)

    def _process_payload(self, machine_id: UUID, payload_dict: dict[str, Any]) -> None:
        if self._session_factory is None:
            raise RuntimeError("Database session factory is not configured for MQTT gateway.")

        session = self._session_factory()
        try:
            mapper = TelemetryMapper(session=session)
            # Map and validate entities against DB
            telemetry_create = mapper.map_payload(
                payload_dict,
                authoritative_machine_id=machine_id,
                validate_db=True,
            )

            service = self._create_telemetry_service(session)
            service.ingest(telemetry_create)
            logger.debug(
                "Successfully ingested MQTT telemetry for machine %s (timestamp: %s)",
                machine_id,
                telemetry_create.timestamp,
            )
        except SQLAlchemyError as err:
            session.rollback()
            raise GatewayMessageError(f"Database error during telemetry ingestion: {err}") from err
        finally:
            session.close()

    def process_message_direct(self, topic: str, payload_bytes: bytes) -> bool:
        """Direct programmatic ingestion helper for tests and mock invocations.

        Returns True if message was successfully ingested, False otherwise.
        """
        self._messages_received += 1
        self._last_message_at = datetime.now(timezone.utc)
        try:
            parsed_topic = self._parser.parse_topic(topic)
            if parsed_topic is None:
                return False
            payload_dict = self._parser.parse_payload(payload_bytes)
            self._process_payload(parsed_topic.machine_id, payload_dict)
            self._messages_ingested += 1
            return True
        except GatewayMessageError as err:
            self._messages_rejected += 1
            logger.warning("Rejected direct message on '%s': %s", topic, err)
            raise
        except Exception as err:
            self._messages_rejected += 1
            logger.exception("Unexpected error on direct message '%s': %s", topic, err)
            raise

    def start(self) -> None:
        """Start the MQTT gateway client and background network loop."""
        if not self._settings.mqtt_enabled:
            logger.info("MQTT Hardware Gateway is disabled by configuration (MQTT_ENABLED=false).")
            return

        if self._is_running:
            logger.warning("MQTT Gateway is already running.")
            return

        logger.info(
            "Initializing MQTT Gateway (broker: %s:%d, client_id: %s)...",
            self._settings.mqtt_host,
            self._settings.mqtt_port,
            self._settings.mqtt_client_id,
        )

        client = mqtt.Client(
            mqtt.CallbackAPIVersion.VERSION2,
            client_id=self._settings.mqtt_client_id,
        )

        if self._settings.mqtt_username and self._settings.mqtt_password:
            client.username_pw_set(
                username=self._settings.mqtt_username,
                password=self._settings.mqtt_password,
            )

        if self._settings.mqtt_tls_enabled:
            client.tls_set(
                ca_certs=self._settings.mqtt_tls_ca_cert,
                cert_reqs=ssl.CERT_REQUIRED if self._settings.mqtt_tls_ca_cert else ssl.CERT_NONE,
            )

        client.on_connect = self._on_connect
        client.on_disconnect = self._on_disconnect
        client.on_subscribe = self._on_subscribe
        client.on_message = self._on_message
        client.reconnect_delay_set(
            min_delay=1,
            max_delay=int(self._settings.mqtt_reconnect_interval_seconds * 4),
        )

        self._client = client
        self._is_running = True

        try:
            client.connect_async(
                self._settings.mqtt_host,
                self._settings.mqtt_port,
                keepalive=self._settings.mqtt_keepalive,
            )
        except Exception as err:
            logger.warning(
                "Could not immediately connect to MQTT broker at %s:%d: %s. Gateway will retry in background.",
                self._settings.mqtt_host,
                self._settings.mqtt_port,
                err,
            )

        client.loop_start()

    def stop(self) -> None:
        """Stop the MQTT gateway client and background network loop gracefully."""
        if not self._is_running or self._client is None:
            return

        logger.info("Stopping MQTT Hardware Gateway...")
        try:
            self._client.loop_stop()
            self._client.disconnect()
        except Exception as err:
            logger.warning("Error while disconnecting MQTT client: %s", err)
        finally:
            self._is_connected = False
            self._is_running = False
            self._client = None
            logger.info("MQTT Hardware Gateway stopped.")

