from __future__ import annotations

from dataclasses import dataclass
import json
import logging
from typing import Any
from uuid import UUID

logger = logging.getLogger(__name__)


class GatewayMessageError(Exception):
    """Base exception for MQTT gateway message parsing errors."""


class InvalidTopicError(GatewayMessageError):
    """Raised when an MQTT topic is structurally malformed or has an invalid machine UUID."""


class UnsupportedTopicVersionError(GatewayMessageError):
    """Raised when an MQTT topic specifies an unsupported version (e.g., v2 when only v1 is supported)."""


class OversizedPayloadError(GatewayMessageError):
    """Raised when an MQTT payload exceeds the maximum permitted byte size."""


class MalformedPayloadError(GatewayMessageError):
    """Raised when an MQTT payload cannot be decoded as UTF-8 or parsed as a JSON object."""


@dataclass(frozen=True, slots=True)
class ParsedTopic:
    prefix: str
    version: str
    machine_id: UUID
    raw_topic: str


class MessageParser:
    """Parses and validates MQTT topics and incoming JSON payloads."""

    def __init__(
        self,
        topic_prefix: str = "orvex",
        max_payload_bytes: int = 65536,
    ) -> None:
        self.topic_prefix = topic_prefix.strip("/")
        self.max_payload_bytes = max_payload_bytes

    def parse_topic(self, topic: str) -> ParsedTopic | None:
        """Parse an MQTT topic into its components.

        Expected topic format:
            {prefix}/{version}/machines/{machine_id}/telemetry
        e.g.:
            orvex/v1/machines/00000000-0000-0000-de30-000000000011/telemetry

        Returns:
            ParsedTopic if the topic is valid.
            None if the topic is completely unrelated (does not start with prefix).

        Raises:
            InvalidTopicError: If the topic belongs to this prefix but has incorrect segments or an invalid machine UUID.
            UnsupportedTopicVersionError: If the topic version is not 'v1'.
        """
        if not topic or not isinstance(topic, str):
            raise InvalidTopicError("Topic must be a non-empty string.")

        parts = topic.split("/")

        # Safely ignore unrelated topics (e.g. broker internal $SYS/..., or different app topics)
        if parts[0] != self.topic_prefix:
            return None

        # Expect exactly 5 parts: prefix / version / "machines" / machine_id / "telemetry"
        if len(parts) != 5:
            raise InvalidTopicError(
                f"Topic '{topic}' has {len(parts)} segments; expected 5 "
                f"('{self.topic_prefix}/v1/machines/{{machine_id}}/telemetry')."
            )

        version = parts[1]
        if version != "v1":
            raise UnsupportedTopicVersionError(
                f"Topic '{topic}' specifies unsupported version '{version}'; supported version is 'v1'."
            )

        resource = parts[2]
        action = parts[4]
        if resource != "machines" or action != "telemetry":
            raise InvalidTopicError(
                f"Topic '{topic}' is malformed; expected '{self.topic_prefix}/v1/machines/{{machine_id}}/telemetry'."
            )

        machine_id_str = parts[3]
        try:
            machine_id = UUID(machine_id_str)
        except ValueError as err:
            raise InvalidTopicError(
                f"Topic '{topic}' contains invalid machine UUID '{machine_id_str}': {err}."
            ) from err

        return ParsedTopic(
            prefix=self.topic_prefix,
            version=version,
            machine_id=machine_id,
            raw_topic=topic,
        )

    def parse_payload(self, payload: bytes | str) -> dict[str, Any]:
        """Decode and parse an incoming MQTT message payload into a dictionary.

        Raises:
            OversizedPayloadError: If payload exceeds max_payload_bytes.
            MalformedPayloadError: If decoding fails or content is not a valid JSON object.
        """
        if isinstance(payload, str):
            payload_bytes = payload.encode("utf-8")
        elif isinstance(payload, (bytes, bytearray)):
            payload_bytes = bytes(payload)
        else:
            raise MalformedPayloadError(f"Unsupported payload type '{type(payload).__name__}'.")

        if len(payload_bytes) > self.max_payload_bytes:
            raise OversizedPayloadError(
                f"Payload size ({len(payload_bytes)} bytes) exceeds maximum permitted limit ({self.max_payload_bytes} bytes)."
            )

        if not payload_bytes:
            raise MalformedPayloadError("Payload is empty.")

        try:
            text = payload_bytes.decode("utf-8")
        except UnicodeDecodeError as err:
            raise MalformedPayloadError(f"Payload is not valid UTF-8: {err}.") from err

        try:
            data = json.loads(text)
        except json.JSONDecodeError as err:
            raise MalformedPayloadError(f"Malformed JSON in payload: {err}.") from err

        if not isinstance(data, dict):
            raise MalformedPayloadError(
                f"Payload must be a JSON object/dictionary, got '{type(data).__name__}'."
            )

        return data

