from __future__ import annotations

from datetime import datetime, timezone
import json
import logging
import math
import ssl
import time
from typing import Any
from uuid import UUID

import paho.mqtt.client as mqtt

from hardware.config import EdgeConfig

logger = logging.getLogger(__name__)


class EdgePublishError(RuntimeError):
    """Raised when publishing telemetry to the MQTT broker fails."""


class EdgeMqttPublisher:
    """Configurable edge MQTT publisher for industrial telemetry.

    Publishes validated sensor telemetry to the ORVEX MQTT gateway with
    automatic reconnection, payload validation, and clean credentials isolation.
    """

    def __init__(self, config: EdgeConfig) -> None:
        self._config = config
        self._connected: bool = False
        self._messages_sent: int = 0
        self._messages_failed: int = 0
        self._last_sent_at: datetime | None = None

        cid = self._config.mqtt_client_id or f"orvex-edge-{int(time.time())}"
        self._client = mqtt.Client(
            mqtt.CallbackAPIVersion.VERSION2,
            client_id=cid,
        )

        if self._config.mqtt_username and self._config.mqtt_password:
            self._client.username_pw_set(
                username=self._config.mqtt_username,
                password=self._config.mqtt_password,
            )

        self._client.on_connect = self._on_connect
        self._client.on_disconnect = self._on_disconnect

    @property
    def is_connected(self) -> bool:
        return self._connected

    @property
    def messages_sent(self) -> int:
        return self._messages_sent

    def _on_connect(
        self,
        client: mqtt.Client,
        userdata: Any,
        flags: Any,
        reason_code: mqtt.ReasonCode,
        properties: Any = None,
    ) -> None:
        if reason_code == 0:
            self._connected = True
            logger.info("Connected to MQTT broker at %s:%d", self._config.mqtt_host, self._config.mqtt_port)
        else:
            self._connected = False
            logger.warning("Failed to connect to MQTT broker: reason_code=%s", reason_code)

    def _on_disconnect(
        self,
        client: mqtt.Client,
        userdata: Any,
        disconnect_flags: Any,
        reason_code: mqtt.ReasonCode,
        properties: Any = None,
    ) -> None:
        self._connected = False
        if reason_code != 0:
            logger.warning("Disconnected unexpectedly from MQTT broker: reason_code=%s. Auto-reconnecting.", reason_code)

    def connect(self, timeout: float = 5.0) -> bool:
        """Connect to the MQTT broker and start the network loop."""
        try:
            self._client.connect(
                self._config.mqtt_host,
                self._config.mqtt_port,
                keepalive=60,
            )
            self._client.loop_start()

            # Wait briefly for on_connect callback
            deadline = time.time() + timeout
            while time.time() < deadline:
                if self._connected:
                    return True
                time.sleep(0.05)
            return self._connected
        except Exception as err:
            logger.warning("Could not connect to MQTT broker (%s:%d): %s", self._config.mqtt_host, self._config.mqtt_port, err)
            return False

    def disconnect(self) -> None:
        """Gracefully stop network loop and disconnect from broker."""
        try:
            self._client.loop_stop()
            self._client.disconnect()
            self._connected = False
        except Exception as err:
            logger.debug("Error during MQTT disconnect: %s", err)

    def validate_payload(self, payload: dict[str, Any]) -> None:
        """Validate telemetry payload before transmission to guarantee gateway compatibility."""
        if "timestamp" not in payload or not payload["timestamp"]:
            raise EdgePublishError("Payload missing required 'timestamp' field.")

        if "machine_id" not in payload or not payload["machine_id"]:
            raise EdgePublishError("Payload missing required 'machine_id' field.")

        # Ensure numeric fields contain no NaN or Infinity
        numeric_fields = [
            "voltage", "current", "active_power", "reactive_power",
            "apparent_power", "power_factor", "cumulative_energy",
            "rpm", "temperature", "load_percent"
        ]
        for field in numeric_fields:
            val = payload.get(field)
            if val is not None:
                if not isinstance(val, (int, float)):
                    raise EdgePublishError(f"Field '{field}' must be numeric, got {type(val)}.")
                if math.isnan(val) or math.isinf(val):
                    raise EdgePublishError(f"Field '{field}' cannot be NaN or infinite.")

        # Power factor range check
        pf = payload.get("power_factor")
        if pf is not None and not (-1.0 <= pf <= 1.0):
            raise EdgePublishError(f"power_factor must be between -1.0 and 1.0 (got {pf}).")

    def publish_reading(self, payload: dict[str, Any], timeout: float = 3.0) -> None:
        """Validate and publish a telemetry record via MQTT QoS 1."""
        self.validate_payload(payload)

        machine_id = payload["machine_id"]
        topic = f"{self._config.mqtt_topic_prefix}/v1/machines/{machine_id}/telemetry"
        payload_bytes = json.dumps(payload, allow_nan=False).encode("utf-8")

        info = self._client.publish(topic, payload=payload_bytes, qos=1)
        try:
            info.wait_for_publish(timeout=timeout)
            self._messages_sent += 1
            self._last_sent_at = datetime.now(timezone.utc)
            logger.debug("Published telemetry for machine %s to '%s'", machine_id, topic)
        except Exception as err:
            self._messages_failed += 1
            raise EdgePublishError(f"MQTT publish failed for topic '{topic}': {err}") from err

