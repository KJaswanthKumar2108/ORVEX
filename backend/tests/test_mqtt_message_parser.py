from __future__ import annotations

import json
from uuid import UUID, uuid4

import pytest

from app.gateway.message_parser import (
    InvalidTopicError,
    MalformedPayloadError,
    MessageParser,
    OversizedPayloadError,
    ParsedTopic,
    UnsupportedTopicVersionError,
)


@pytest.fixture
def parser() -> MessageParser:
    return MessageParser(topic_prefix="orvex", max_payload_bytes=1024)


class TestMessageParserTopics:
    def test_valid_topic_parsing(self, parser: MessageParser) -> None:
        machine_id = uuid4()
        topic = f"orvex/v1/machines/{machine_id}/telemetry"
        parsed = parser.parse_topic(topic)

        assert parsed is not None
        assert parsed.prefix == "orvex"
        assert parsed.version == "v1"
        assert parsed.machine_id == machine_id
        assert parsed.raw_topic == topic

    def test_unrelated_topic_ignored_safely(self, parser: MessageParser) -> None:
        # Broker system topics or other application prefixes should return None
        assert parser.parse_topic("$SYS/broker/uptime") is None
        assert parser.parse_topic("factory/v1/telemetry") is None
        assert parser.parse_topic("other/machines/123") is None

    def test_malformed_topic_missing_segments(self, parser: MessageParser) -> None:
        with pytest.raises(InvalidTopicError, match="expected 5"):
            parser.parse_topic("orvex/v1/machines")

        with pytest.raises(InvalidTopicError, match="expected 5"):
            parser.parse_topic("orvex/v1/machines/123/telemetry/extra")

    def test_unsupported_version_rejected(self, parser: MessageParser) -> None:
        machine_id = uuid4()
        with pytest.raises(UnsupportedTopicVersionError, match="unsupported version 'v2'"):
            parser.parse_topic(f"orvex/v2/machines/{machine_id}/telemetry")

        with pytest.raises(UnsupportedTopicVersionError, match="unsupported version 'beta'"):
            parser.parse_topic(f"orvex/beta/machines/{machine_id}/telemetry")

    def test_invalid_machine_uuid_rejected(self, parser: MessageParser) -> None:
        with pytest.raises(InvalidTopicError, match="invalid machine UUID"):
            parser.parse_topic("orvex/v1/machines/not-a-valid-uuid/telemetry")

    def test_malformed_resource_or_action_rejected(self, parser: MessageParser) -> None:
        machine_id = uuid4()
        with pytest.raises(InvalidTopicError, match="is malformed"):
            parser.parse_topic(f"orvex/v1/sensors/{machine_id}/telemetry")

        with pytest.raises(InvalidTopicError, match="is malformed"):
            parser.parse_topic(f"orvex/v1/machines/{machine_id}/status")

    def test_empty_or_non_string_topic_rejected(self, parser: MessageParser) -> None:
        with pytest.raises(InvalidTopicError):
            parser.parse_topic("")


class TestMessageParserPayloads:
    def test_valid_json_payload_parsed(self, parser: MessageParser) -> None:
        data = {"timestamp": "2026-10-30T10:00:00Z", "voltage": 415.0, "current": 20.5}
        payload_bytes = json.dumps(data).encode("utf-8")

        result = parser.parse_payload(payload_bytes)
        assert result == data

    def test_oversized_payload_rejected(self, parser: MessageParser) -> None:
        big_dict = {"data": "x" * 2000}
        payload_bytes = json.dumps(big_dict).encode("utf-8")

        with pytest.raises(OversizedPayloadError, match="exceeds maximum permitted limit"):
            parser.parse_payload(payload_bytes)

    def test_empty_payload_rejected(self, parser: MessageParser) -> None:
        with pytest.raises(MalformedPayloadError, match="empty"):
            parser.parse_payload(b"")

    def test_invalid_utf8_rejected(self, parser: MessageParser) -> None:
        with pytest.raises(MalformedPayloadError, match="not valid UTF-8"):
            parser.parse_payload(b"\xff\xfe\xfa")

    def test_malformed_json_syntax_rejected(self, parser: MessageParser) -> None:
        with pytest.raises(MalformedPayloadError, match="Malformed JSON"):
            parser.parse_payload(b"{this is not valid json}")

    def test_non_object_json_rejected(self, parser: MessageParser) -> None:
        # JSON arrays, numbers, strings must be rejected as payloads
        with pytest.raises(MalformedPayloadError, match="must be a JSON object"):
            parser.parse_payload(b"[1, 2, 3]")

        with pytest.raises(MalformedPayloadError, match="must be a JSON object"):
            parser.parse_payload(b'"just a string"')

        with pytest.raises(MalformedPayloadError, match="must be a JSON object"):
            parser.parse_payload(b"42")

