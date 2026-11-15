from __future__ import annotations

import json
import logging
import time
from uuid import UUID

import paho.mqtt.client as mqtt

from simulator.models import TelemetryRecord

logger = logging.getLogger(__name__)


class TelemetryMqttClientError(RuntimeError):
    """Raised when publishing telemetry via MQTT fails."""


class TelemetryMqttClient:
    """Publishes simulated telemetry records directly to the ORVEX MQTT broker."""

    def __init__(
        self,
        host: str = "localhost",
        port: int = 1883,
        topic_prefix: str = "orvex",
        username: str | None = None,
        password: str | None = None,
        client_id: str | None = None,
        keepalive: int = 60,
    ) -> None:
        self.host = host
        self.port = port
        self.topic_prefix = topic_prefix.strip("/")
        self.keepalive = keepalive

        cid = client_id or f"orvex-sim-{int(time.time())}"
        self._client = mqtt.Client(
            mqtt.CallbackAPIVersion.VERSION2,
            client_id=cid,
        )

        if username and password:
            self._client.username_pw_set(username, password)

        try:
            self._client.connect(self.host, self.port, keepalive=self.keepalive)
            self._client.loop_start()
        except Exception as err:
            raise TelemetryMqttClientError(
                f"Failed to connect to MQTT broker at {self.host}:{self.port}: {err}"
            ) from err

    def topic_for_machine(self, machine_id: UUID) -> str:
        return f"{self.topic_prefix}/v1/machines/{machine_id}/telemetry"

    def send(self, telemetry: TelemetryRecord, timeout: float = 3.0) -> None:
        topic = self.topic_for_machine(telemetry.machine_id)
        payload_dict = telemetry.to_payload()
        payload_bytes = json.dumps(payload_dict, allow_nan=False).encode("utf-8")

        info = self._client.publish(topic, payload=payload_bytes, qos=1)
        try:
            info.wait_for_publish(timeout=timeout)
        except (RuntimeError, ValueError) as err:
            raise TelemetryMqttClientError(f"MQTT publish failed for topic '{topic}': {err}") from err

    def close(self) -> None:
        try:
            self._client.loop_stop()
            self._client.disconnect()
        except Exception:
            pass

