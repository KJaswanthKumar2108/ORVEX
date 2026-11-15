"""ORVEX MQTT Hardware Gateway Package.

Provides asynchronous ingestion of telemetry published by edge hardware microcontrollers and sensors,
enforcing topic validation, machine identity verification, and payload normalization before feeding
the existing analytics and wastage detection pipeline.
"""

from app.gateway.message_parser import (
    GatewayMessageError,
    InvalidTopicError,
    MalformedPayloadError,
    MessageParser,
    OversizedPayloadError,
    ParsedTopic,
    UnsupportedTopicVersionError,
)
from app.gateway.mqtt_client import MqttGateway
from app.gateway.telemetry_mapper import (
    FIELD_ALIASES,
    InvalidMeasurementValueError,
    InvalidTimestampError,
    MachineIdentityMismatchError,
    MachineNotFoundError,
    SensorAssociationError,
    SensorNotFoundError,
    TelemetryMapper,
    TelemetryMappingError,
)

__all__ = [
    "FIELD_ALIASES",
    "GatewayMessageError",
    "InvalidMeasurementValueError",
    "InvalidTimestampError",
    "InvalidTopicError",
    "MachineIdentityMismatchError",
    "MachineNotFoundError",
    "MalformedPayloadError",
    "MessageParser",
    "MqttGateway",
    "OversizedPayloadError",
    "ParsedTopic",
    "SensorAssociationError",
    "SensorNotFoundError",
    "TelemetryMapper",
    "TelemetryMappingError",
    "UnsupportedTopicVersionError",
]

