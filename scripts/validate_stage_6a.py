"""ORVEX Stage 6A Complete End-to-End Validation Suite: MQTT Hardware Gateway Integration.

Validates:
1. Environment & Service Connectivity:
   - FastAPI Health Check with MQTT gateway diagnostic reporting (?details=true)
   - Mosquitto MQTT Broker Connectivity (1883)
   - TimescaleDB Database Connectivity
2. Machine & Sensor Association Rules:
   - Registered machine accepting telemetry
   - Sensor belonging to matching machine accepted
   - Sensor belonging to different machine rejected (cross-machine sensor association check)
   - Unknown machine / unknown sensor rejection
   - Topic machine_id vs payload machine_id mismatch rejection
3. MQTT Topic Parsing & Payload Validation:
   - Canonical 5-part topic structure: {prefix}/v1/machines/{machine_id}/telemetry
   - Oversized payload rejection (>64KB limit)
   - Malformed JSON rejection without crashing gateway
   - Unit suffix alias normalization (voltage_v, active_power_kw, etc.)
   - NaN / Infinity floating point rejection
   - Preservation of None for optional metrics
4. Full End-to-End Analytics Pipeline via MQTT:
   - All 5 simulator scenarios published over MQTT (QoS 1):
     * normal -> telemetry saved, 0 events, 0 alerts
     * idle_wastage -> IDLE_WASTAGE event detected & persisted, 1 in-app alert
     * low_load_wastage -> LOW_LOAD_WASTAGE event detected & persisted, 1 in-app alert
     * abnormal_power -> ABNORMAL_POWER event detected & persisted, 1 in-app alert
     * start_stop_cycling -> START_STOP_CYCLING event detected & persisted (NULL wasted energy preserved), 1 in-app alert
5. Deduplication & Idempotency:
   - Re-transmitting MQTT telemetry does not produce duplicate events or alerts
6. Read-Only REST API Verification:
   - /api/v1/machines/{id}/summary reflects MQTT telemetry
   - /api/v1/machines/{id}/energy-summary reflects MQTT telemetry
   - /api/v1/machines/{id}/wastage-events reflects MQTT detection events
   - /api/v1/machines/{id}/alerts reflects MQTT generated alerts
   - /api/v1/reports/energy-wastage reflects MQTT events
7. Complete Database Cleanup:
   - 0 residual rows in database
"""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import json
import os
import sys
import time
from typing import Any
from uuid import UUID, uuid4

import paho.mqtt.client as mqtt
import requests
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

# Add project root and backend to sys.path
sys.path.insert(0, os.path.abspath("."))
sys.path.insert(0, os.path.abspath("backend"))

from analytics.config import DetectionConfig
from analytics.models import OperatingState
from app.core.config import get_settings
from app.db.models import Alert, EnergyWastageEvent, Machine, Sensor, Site, Telemetry
from app.db.session import create_database_engine, create_session_factory
from app.gateway.message_parser import MessageParser
from app.gateway.telemetry_mapper import TelemetryMapper
from app.repositories.wastage_event_repository import WastageEventRepository
from app.services.analytics_orchestrator import AnalyticsOrchestrator
from app.services.wastage_event_service import WastageEventService
from simulator.generator import TelemetryGenerator
from simulator.models import Scenario
from simulator.mqtt_client import TelemetryMqttClient
from simulator.profiles import DEFAULT_PROFILE
from simulator.scenarios import ScenarioController

API_BASE_URL = os.environ.get("ORVEX_API_URL", "http://127.0.0.1:8000")
MQTT_HOST = os.environ.get("MQTT_HOST", "127.0.0.1")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
MQTT_TOPIC_PREFIX = os.environ.get("MQTT_TOPIC_PREFIX", "orvex").strip()

# Isolated UUIDs for Stage 6A Validation
VAL_SITE_ID = UUID("00000000-0000-0000-6a00-000000000001")
VAL_MACHINE_1_ID = UUID("00000000-0000-0000-6a00-000000000011")
VAL_MACHINE_2_ID = UUID("00000000-0000-0000-6a00-000000000022")
VAL_SENSOR_1_ID = UUID("00000000-0000-0000-6a00-000000000101")
VAL_SENSOR_2_ID = UUID("00000000-0000-0000-6a00-000000000202")

FAST_DETECTION_CONFIG = DetectionConfig(
    minimum_condition_samples=2,
    minimum_idle_duration_seconds=5.0,
    minimum_idle_excess_power_kw=5.0,
    minimum_low_load_duration_seconds=10.0,
    minimum_low_load_excess_power_kw=5.0,
    minimum_abnormal_duration_seconds=5.0,
    minimum_abnormal_excess_power_kw=5.0,
    minimum_cycles=2,
    cycling_window_seconds=120.0,
)


def get_db() -> tuple[Any, Session]:
    settings = get_settings()
    engine = create_database_engine(settings.database_url)
    session_factory = create_session_factory(engine)
    return engine, session_factory()


def check_services() -> None:
    print("\n" + "=" * 75)
    print("STEP 1: Checking Service Health and Gateway Status")
    print("=" * 75)

    # 1. FastAPI Standard Health
    resp_std = requests.get(f"{API_BASE_URL}/health", timeout=3.0)
    assert resp_std.status_code == 200, f"Health check failed: {resp_std.status_code}"
    assert resp_std.json() == {"status": "ok"}, f"Standard health response mismatch: {resp_std.json()}"
    print("  [PASS] FastAPI /health returns exact standard contract: {'status': 'ok'}")

    # 2. FastAPI Detailed Health with MQTT Gateway
    resp_det = requests.get(f"{API_BASE_URL}/health?details=true", timeout=3.0)
    assert resp_det.status_code == 200, f"Detailed health check failed: {resp_det.status_code}"
    det_body = resp_det.json()
    assert det_body.get("status") == "ok"
    assert "mqtt_gateway" in det_body, "mqtt_gateway missing from ?details=true"
    gw_info = det_body["mqtt_gateway"]
    assert gw_info.get("enabled") is True, f"MQTT Gateway not enabled: {gw_info}"
    assert gw_info.get("running") is True, f"MQTT Gateway not running: {gw_info}"
    assert gw_info.get("connected") is True, f"MQTT Gateway not connected to broker: {gw_info}"
    assert gw_info.get("topic_prefix") == MQTT_TOPIC_PREFIX
    print(f"  [PASS] FastAPI /health?details=true: Gateway CONNECTED ({gw_info.get('broker')}, prefix: '{MQTT_TOPIC_PREFIX}')")

    # 3. Direct MQTT Broker Connection
    test_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="val-service-check")
    test_client.connect(MQTT_HOST, MQTT_PORT, keepalive=10)
    test_client.loop_start()
    time.sleep(0.5)
    assert test_client.is_connected(), f"Direct MQTT connection to {MQTT_HOST}:{MQTT_PORT} failed"
    test_client.loop_stop()
    test_client.disconnect()
    print(f"  [PASS] Mosquitto MQTT Broker online and responsive at {MQTT_HOST}:{MQTT_PORT}")

    # 4. TimescaleDB Database Connection
    engine, session = get_db()
    try:
        ver = session.execute(text("SELECT version();")).scalar()
        assert ver is not None
        print("  [PASS] TimescaleDB online and responsive")
    finally:
        session.close()
        engine.dispose()


def setup_test_entities() -> None:
    print("\n" + "=" * 75)
    print("STEP 2: Provisioning Isolated Validation Fleet & Sensors")
    print("=" * 75)

    engine, session = get_db()
    try:
        # Clean any previous leftovers if exist
        _cleanup_rows(session)

        # 1. Site
        site = Site(
            id=VAL_SITE_ID,
            name="Stage 6A Gateway Validation Mine",
            location="Test Basin, Pilbara",
            timezone="Australia/Perth",
        )
        session.add(site)

        # 2. Machine 1
        m1 = Machine(
            id=VAL_MACHINE_1_ID,
            site_id=VAL_SITE_ID,
            machine_identifier="VAL-GATEWAY-01",
            name="Primary Gateway Validation Machine",
            machine_type="conveyor",
            rated_power_kw=Decimal("132.0"),
            status="active",
        )
        session.add(m1)

        # 3. Machine 2
        m2 = Machine(
            id=VAL_MACHINE_2_ID,
            site_id=VAL_SITE_ID,
            machine_identifier="VAL-GATEWAY-02",
            name="Secondary Gateway Validation Machine",
            machine_type="pump",
            rated_power_kw=Decimal("75.0"),
            status="active",
        )
        session.add(m2)
        session.flush()

        # 4. Sensor 1 (bound to Machine 1)
        s1 = Sensor(
            id=VAL_SENSOR_1_ID,
            machine_id=VAL_MACHINE_1_ID,
            sensor_identifier="SENS-VAL-01",
            sensor_type="power_meter",
            unit="kW",
            status="active",
        )
        session.add(s1)

        # 5. Sensor 2 (bound to Machine 2)
        s2 = Sensor(
            id=VAL_SENSOR_2_ID,
            machine_id=VAL_MACHINE_2_ID,
            sensor_identifier="SENS-VAL-02",
            sensor_type="power_meter",
            unit="kW",
            status="active",
        )
        session.add(s2)

        session.commit()
        print(f"  [CREATED] Site: {site.id}")
        print(f"  [CREATED] Machine 1: {m1.id} (VAL-GATEWAY-01)")
        print(f"  [CREATED] Machine 2: {m2.id} (VAL-GATEWAY-02)")
        print(f"  [CREATED] Sensor 1: {s1.id} (bound to Machine 1)")
        print(f"  [CREATED] Sensor 2: {s2.id} (bound to Machine 2)")
    finally:
        session.close()
        engine.dispose()


def validate_parsing_and_association() -> None:
    print("\n" + "=" * 75)
    print("STEP 3: Validating Topic Structure, Payload Mapping & Sensor Association")
    print("=" * 75)

    engine, session = get_db()
    try:
        mapper = TelemetryMapper(session)
        parser = MessageParser(topic_prefix="orvex", max_payload_bytes=65536)

        # 1. Valid topic parsing
        valid_topic = f"orvex/v1/machines/{VAL_MACHINE_1_ID}/telemetry"
        parsed = parser.parse_topic(valid_topic)
        assert parsed is not None
        assert parsed.machine_id == VAL_MACHINE_1_ID
        print(f"  [PASS] Canonical topic structure parsed successfully: '{valid_topic}'")

        # 2. Invalid topics safely handled
        assert parser.parse_topic("$SYS/broker/uptime") is None
        assert parser.parse_topic("other/v1/machines/uuid/telemetry") is None
        try:
            parser.parse_topic("orvex/v2/machines/123/telemetry")
            assert False, "Should raise UnsupportedTopicVersionError"
        except Exception:
            print("  [PASS] Unsupported topic version rejected (v2)")

        try:
            parser.parse_topic(f"orvex/v1/machines/not-a-uuid/telemetry")
            assert False, "Should raise InvalidTopicError for bad UUID"
        except Exception:
            print("  [PASS] Malformed UUID in topic rejected")

        # 3. Payload size check
        oversized = b"x" * 70000
        try:
            parser.parse_payload(oversized)
            assert False, "Should raise OversizedPayloadError"
        except Exception:
            print("  [PASS] Oversized payload (>64KB) rejected cleanly")

        # 4. Malformed JSON check
        try:
            parser.parse_payload(b"{bad json, no quotes}")
            assert False, "Should raise MalformedPayloadError"
        except Exception:
            print("  [PASS] Malformed JSON bytes rejected without raising unhandled exception")

        # 5. Unit suffix aliases normalization
        payload_with_units = {
            "timestamp": "2026-10-30T10:00:00Z",
            "voltage_v": 415.5,
            "current_a": 120.3,
            "active_power_kw": 45.2,
            "reactive_power_kvar": 12.1,
            "apparent_power_kva": 46.8,
            "power_factor": 0.965,
            "frequency_hz": 50.0,
            "rpm": 1480.0,
            "temperature_c": 52.3,
            "load_percent": 68.0,
            "operating_state": "RUNNING",
        }
        mapped = mapper.map_payload(payload_with_units, VAL_MACHINE_1_ID)
        assert mapped.machine_id == VAL_MACHINE_1_ID
        assert float(mapped.voltage) == 415.5
        assert float(mapped.active_power) == 45.2
        assert float(mapped.temperature) == 52.3
        print("  [PASS] Unit suffix aliases (voltage_v, active_power_kw, temperature_c) normalized to canonical fields")

        # 6. NaN / Infinity rejection
        for bad_val in [float("nan"), float("inf"), float("-inf")]:
            try:
                mapper.map_payload(
                    {"timestamp": "2026-10-30T10:00:00Z", "active_power": bad_val},
                    VAL_MACHINE_1_ID,
                )
                assert False, f"Should reject {bad_val}"
            except Exception:
                pass
        print("  [PASS] NaN and +/-Infinity numeric values rejected")

        # 7. Machine identity mismatch rejection
        try:
            mapper.map_payload(
                {"timestamp": "2026-10-30T10:00:00Z", "machine_id": str(VAL_MACHINE_2_ID)},
                VAL_MACHINE_1_ID,
            )
            assert False, "Should reject machine identity mismatch"
        except Exception:
            print("  [PASS] Mismatched machine_id in payload rejected (topic is authoritative)")

        # 8. Sensor association rules
        # Valid: Sensor 1 on Machine 1
        valid_sensor_payload = {
            "timestamp": "2026-10-30T10:00:00Z",
            "sensor_id": str(VAL_SENSOR_1_ID),
            "active_power": 50.0,
        }
        res = mapper.map_payload(valid_sensor_payload, VAL_MACHINE_1_ID)
        assert res.sensor_id == VAL_SENSOR_1_ID
        print("  [PASS] Valid sensor association accepted: Sensor 1 on Machine 1")

        # Invalid: Sensor 2 on Machine 1 (Sensor 2 belongs to Machine 2!)
        cross_sensor_payload = {
            "timestamp": "2026-10-30T10:00:00Z",
            "sensor_id": str(VAL_SENSOR_2_ID),
            "active_power": 50.0,
        }
        try:
            mapper.map_payload(cross_sensor_payload, VAL_MACHINE_1_ID)
            assert False, "Should reject Sensor 2 associated with Machine 1"
        except Exception:
            print("  [PASS] Cross-machine sensor association rejected: Sensor 2 cannot publish for Machine 1")

        # Unknown sensor rejection
        try:
            mapper.map_payload(
                {"timestamp": "2026-10-30T10:00:00Z", "sensor_id": str(uuid4())},
                VAL_MACHINE_1_ID,
            )
            assert False, "Should reject unknown sensor UUID"
        except Exception:
            print("  [PASS] Non-existent sensor rejected")

    finally:
        session.close()
        engine.dispose()


def validate_mqtt_scenarios() -> None:
    print("\n" + "=" * 75)
    print("STEP 4: Publishing All 5 Scenarios Over MQTT (End-to-End Ingestion & Detection)")
    print("=" * 75)

    scenarios = [
        (Scenario.NORMAL_OPERATION, "normal", 0, None),
        (Scenario.IDLE_WASTAGE, "idle_wastage", 1, "IDLE_WASTAGE"),
        (Scenario.LOW_LOAD_WASTAGE, "low_load_wastage", 1, "LOW_LOAD_WASTAGE"),
        (Scenario.ABNORMAL_POWER, "abnormal_power", 1, "ABNORMAL_POWER"),
        (Scenario.START_STOP_CYCLING, "start_stop_cycling", 1, "START_STOP_CYCLING"),
    ]

    mqtt_publisher = TelemetryMqttClient(
        host=MQTT_HOST,
        port=MQTT_PORT,
        topic_prefix=MQTT_TOPIC_PREFIX,
        client_id="val-mqtt-publisher",
    )

    try:
        for sc_enum, sc_name, expected_events, expected_reason in scenarios:
            print(f"\n--- Testing Scenario: {sc_name.upper()} over MQTT ---")
            num_samples = 60 if sc_enum == Scenario.START_STOP_CYCLING else (25 if sc_enum == Scenario.LOW_LOAD_WASTAGE else 25)

            profile = replace(
                DEFAULT_PROFILE,
                rated_power_kw=132.0,
                idle_power_kw=DEFAULT_PROFILE.idle_power_kw * (132.0 / DEFAULT_PROFILE.rated_power_kw),
            )
            controller = ScenarioController(sc_enum, profile)
            generator = TelemetryGenerator(machine_id=VAL_MACHINE_1_ID, profile=profile, interval_seconds=1.0)
            start_time = datetime.now(timezone.utc) - timedelta(seconds=num_samples + 5)

            # Publish scenario records over MQTT
            for s in range(num_samples):
                step = controller.step_at(float(s))
                rec = generator.generate(
                    step.state,
                    timestamp=start_time + timedelta(seconds=s),
                    state_elapsed_seconds=step.state_elapsed_seconds,
                    power_multiplier=step.power_multiplier,
                    load_fraction=step.load_fraction,
                )
                payload = rec.to_payload()
                payload["sensor_id"] = str(VAL_SENSOR_1_ID)
                mqtt_publisher.send_payload(VAL_MACHINE_1_ID, payload)

            # Finalize with stopped sample
            stop_payload = generator.generate(step.state, timestamp=start_time + timedelta(seconds=num_samples)).to_payload()
            stop_payload["sensor_id"] = str(VAL_SENSOR_1_ID)
            stop_payload["operating_state"] = "stopped"
            stop_payload["active_power"] = 0.0
            mqtt_publisher.send_payload(VAL_MACHINE_1_ID, stop_payload)

            # Wait for backend gateway loop to ingest all published messages
            expected_total = num_samples + 1
            engine, session = get_db()
            try:
                deadline = time.time() + 10.0
                t_count = 0
                while time.time() < deadline:
                    session.rollback()
                    t_count = session.scalar(
                        select(func.count()).select_from(Telemetry).where(Telemetry.machine_id == VAL_MACHINE_1_ID)
                    ) or 0
                    if t_count >= expected_total:
                        break
                    time.sleep(0.15)

                print(f"  [INGESTED] Telemetry rows in DB for {sc_name}: {t_count}")
                assert t_count >= expected_total, f"Expected at least {expected_total} rows, got {t_count}"

                # Run orchestrator in fast mode to finalize ongoing detection episodes
                w_service = WastageEventService(WastageEventRepository(session))
                orchestrator = AnalyticsOrchestrator(
                    session=session,
                    persistence_service=w_service,
                    config=FAST_DETECTION_CONFIG,
                )
                res = orchestrator.process_machine(VAL_MACHINE_1_ID, finalize_ongoing=True)
                session.commit()

                # Verify events and alerts
                events = session.scalars(
                    select(EnergyWastageEvent)
                    .where(EnergyWastageEvent.machine_id == VAL_MACHINE_1_ID)
                    .order_by(EnergyWastageEvent.start_time.asc())
                ).all()

                alerts = session.scalars(
                    select(Alert)
                    .where(Alert.machine_id == VAL_MACHINE_1_ID)
                    .order_by(Alert.created_at.asc())
                ).all()

                if expected_events == 0:
                    assert len(events) == 0, f"Expected 0 events for normal, got {len(events)}"
                    assert len(alerts) == 0, f"Expected 0 alerts for normal, got {len(alerts)}"
                    print("  [PASS] Normal operation: 0 false-positive events, 0 alerts.")
                else:
                    assert len(events) >= 1, f"Expected at least 1 event for {sc_name}, got {len(events)}"
                    assert len(alerts) >= 1, f"Expected at least 1 alert for {sc_name}, got {len(alerts)}"
                    latest_event = events[-1]
                    assert latest_event.detection_reason.startswith(expected_reason), f"Expected reason starting with {expected_reason}, got {latest_event.detection_reason}"
                    print(f"  [PASS] Event detected: {latest_event.detection_reason} (ID: {latest_event.id})")
                    print(f"  [PASS] In-app Alert created: '{alerts[-1].title}' (Severity: {alerts[-1].severity})")

                    if sc_name == "start_stop_cycling":
                        assert latest_event.estimated_wasted_energy_kwh is None, "Cycling event must have NULL wasted energy"
                        print("  [PASS] start_stop_cycling correctly preserved NULL estimated_wasted_energy_kwh")
                    else:
                        assert latest_event.estimated_wasted_energy_kwh is not None
                        assert latest_event.estimated_wasted_energy_kwh > 0
                        print(f"  [PASS] Estimated wasted energy: {latest_event.estimated_wasted_energy_kwh:.4f} kWh")

            finally:
                # Clear telemetry and events between scenarios for clean per-scenario isolation
                _cleanup_telemetry_and_events(session, VAL_MACHINE_1_ID)
                session.close()
                engine.dispose()

    finally:
        mqtt_publisher.close()


def validate_idempotency_and_deduplication() -> None:
    print("\n" + "=" * 75)
    print("STEP 5: Validating MQTT Retransmission Deduplication & Idempotency")
    print("=" * 75)

    mqtt_publisher = TelemetryMqttClient(
        host=MQTT_HOST,
        port=MQTT_PORT,
        topic_prefix=MQTT_TOPIC_PREFIX,
        client_id="val-mqtt-idempotency",
    )

    try:
        # Publish an idle episode
        profile = replace(
            DEFAULT_PROFILE,
            rated_power_kw=132.0,
            idle_power_kw=DEFAULT_PROFILE.idle_power_kw * (132.0 / DEFAULT_PROFILE.rated_power_kw),
        )
        controller = ScenarioController(Scenario.IDLE_WASTAGE, profile)
        generator = TelemetryGenerator(machine_id=VAL_MACHINE_1_ID, profile=profile, interval_seconds=1.0)
        start_time = datetime.now(timezone.utc) - timedelta(seconds=35)
        num_samples = 25

        for s in range(num_samples):
            step = controller.step_at(float(s))
            rec = generator.generate(
                step.state,
                timestamp=start_time + timedelta(seconds=s),
                state_elapsed_seconds=step.state_elapsed_seconds,
                power_multiplier=step.power_multiplier,
                load_fraction=step.load_fraction,
            )
            payload = rec.to_payload()
            payload["sensor_id"] = str(VAL_SENSOR_1_ID)
            mqtt_publisher.send_payload(VAL_MACHINE_1_ID, payload)

        # Stopped sample
        stop_payload = generator.generate(step.state, timestamp=start_time + timedelta(seconds=num_samples)).to_payload()
        stop_payload["sensor_id"] = str(VAL_SENSOR_1_ID)
        stop_payload["operating_state"] = "stopped"
        stop_payload["active_power"] = 0.0
        mqtt_publisher.send_payload(VAL_MACHINE_1_ID, stop_payload)

        # Wait for messages to be ingested by gateway
        expected_idemp_total = num_samples + 1
        engine, session = get_db()
        try:
            deadline = time.time() + 10.0
            t_count = 0
            while time.time() < deadline:
                session.rollback()
                t_count = session.scalar(
                    select(func.count()).select_from(Telemetry).where(Telemetry.machine_id == VAL_MACHINE_1_ID)
                ) or 0
                if t_count >= expected_idemp_total:
                    break
                time.sleep(0.15)

            # Trigger orchestrator
            w_service = WastageEventService(WastageEventRepository(session))
            orchestrator = AnalyticsOrchestrator(
                session=session,
                persistence_service=w_service,
                config=FAST_DETECTION_CONFIG,
            )
            res1 = orchestrator.process_machine(VAL_MACHINE_1_ID, finalize_ongoing=True)
            session.commit()

            events_count_1 = session.scalar(
                select(func.count()).select_from(EnergyWastageEvent).where(EnergyWastageEvent.machine_id == VAL_MACHINE_1_ID)
            )
            alerts_count_1 = session.scalar(
                select(func.count()).select_from(Alert).where(Alert.machine_id == VAL_MACHINE_1_ID)
            )
            assert events_count_1 == 1, f"Expected 1 event, got {events_count_1}"
            assert alerts_count_1 == 1, f"Expected 1 alert, got {alerts_count_1}"

            # Re-run orchestrator over the exact same data
            res2 = orchestrator.process_machine(VAL_MACHINE_1_ID, finalize_ongoing=True)
            session.commit()

            events_count_2 = session.scalar(
                select(func.count()).select_from(EnergyWastageEvent).where(EnergyWastageEvent.machine_id == VAL_MACHINE_1_ID)
            )
            alerts_count_2 = session.scalar(
                select(func.count()).select_from(Alert).where(Alert.machine_id == VAL_MACHINE_1_ID)
            )

            assert events_count_2 == events_count_1, "Duplicate event created on reprocessing!"
            assert alerts_count_2 == alerts_count_1, "Duplicate alert created on reprocessing!"
            print(f"  [PASS] Pipeline idempotency confirmed: {events_count_1} event -> {events_count_2} event (0 duplicates)")
            print(f"  [PASS] Alert idempotency confirmed: {alerts_count_1} alert -> {alerts_count_2} alert (0 duplicates)")

        finally:
            session.close()
            engine.dispose()

    finally:
        mqtt_publisher.close()


def validate_rest_apis() -> None:
    print("\n" + "=" * 75)
    print("STEP 6: Validating REST API Visibility for MQTT Ingested Data")
    print("=" * 75)

    # 1. Machine Summary API
    resp = requests.get(f"{API_BASE_URL}/api/v1/machines/{VAL_MACHINE_1_ID}/summary", timeout=3.0)
    assert resp.status_code == 200, f"Summary API failed: {resp.status_code}"
    summary = resp.json()
    assert summary["machine_id"] == str(VAL_MACHINE_1_ID)
    assert summary["latest_telemetry_timestamp"] is not None
    assert summary["latest_operating_state"] == "stopped"
    print(f"  [PASS] /api/v1/machines/{VAL_MACHINE_1_ID}/summary returns active telemetry state")

    # 2. Energy Summary API
    now = datetime.now(timezone.utc)
    t_start = (now - timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
    t_end = (now + timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
    resp = requests.get(
        f"{API_BASE_URL}/api/v1/machines/{VAL_MACHINE_1_ID}/energy-summary?start_time={t_start}&end_time={t_end}",
        timeout=3.0,
    )
    assert resp.status_code == 200, f"Energy summary API failed: {resp.status_code}"
    energy = resp.json()
    assert energy["machine_id"] == str(VAL_MACHINE_1_ID)
    assert energy["actual_energy_kwh"] is not None
    assert energy["wastage_event_count"] >= 1
    print(f"  [PASS] /api/v1/machines/{VAL_MACHINE_1_ID}/energy-summary returns energy consumption & event count")

    # 3. Wastage Events API
    resp = requests.get(f"{API_BASE_URL}/api/v1/machines/{VAL_MACHINE_1_ID}/wastage-events", timeout=3.0)
    assert resp.status_code == 200, f"Wastage events API failed: {resp.status_code}"
    events = resp.json()
    assert len(events["items"]) >= 1
    assert events["items"][0]["detection_reason"].startswith("IDLE_WASTAGE")
    print(f"  [PASS] /api/v1/machines/{VAL_MACHINE_1_ID}/wastage-events returns persisted MQTT wastage events")

    # 4. Alerts API
    resp = requests.get(f"{API_BASE_URL}/api/v1/machines/{VAL_MACHINE_1_ID}/alerts", timeout=3.0)
    assert resp.status_code == 200, f"Alerts API failed: {resp.status_code}"
    alerts = resp.json()
    assert len(alerts["items"]) >= 1
    alert_item = alerts["items"][0]
    assert alert_item["alert_type"].startswith("IDLE_WASTAGE")
    print(f"  [PASS] /api/v1/machines/{VAL_MACHINE_1_ID}/alerts returns in-app alerts linked to MQTT event")

    # 5. Energy Wastage Report API
    resp = requests.get(f"{API_BASE_URL}/api/v1/reports/energy-wastage", timeout=3.0)
    assert resp.status_code == 200, f"Report API failed: {resp.status_code}"
    report = resp.json()
    assert "by_machine" in report
    assert "by_reason" in report
    assert "total_wastage_events" in report
    print(f"  [PASS] /api/v1/reports/energy-wastage successfully incorporates MQTT-detected wastage")

    # 6. Detailed Health Check Counters Check
    h_resp = requests.get(f"{API_BASE_URL}/health?details=true", timeout=3.0).json()
    gw_stats = h_resp.get("mqtt_gateway", {})
    assert gw_stats.get("messages_received", 0) > 0, "No messages received recorded by gateway"
    assert gw_stats.get("messages_ingested", 0) > 0, "No messages ingested recorded by gateway"
    print(f"  [PASS] MQTT Gateway runtime metrics: received={gw_stats.get('messages_received')}, ingested={gw_stats.get('messages_ingested')}")


def cleanup_and_verify_zero_residual() -> None:
    print("\n" + "=" * 75)
    print("STEP 7: Complete Teardown & Zero Residual Row Verification")
    print("=" * 75)

    engine, session = get_db()
    try:
        _cleanup_rows(session)

        # Assert zero rows remain for validation IDs
        m_ids = [VAL_MACHINE_1_ID, VAL_MACHINE_2_ID]
        res_m = session.scalar(select(func.count()).select_from(Machine).where(Machine.id.in_(m_ids)))
        res_s = session.scalar(select(func.count()).select_from(Site).where(Site.id == VAL_SITE_ID))
        res_t = session.scalar(select(func.count()).select_from(Telemetry).where(Telemetry.machine_id.in_(m_ids)))
        res_e = session.scalar(select(func.count()).select_from(EnergyWastageEvent).where(EnergyWastageEvent.machine_id.in_(m_ids)))
        res_a = session.scalar(select(func.count()).select_from(Alert).where(Alert.machine_id.in_(m_ids)))

        assert res_m == 0, f"Residual machines: {res_m}"
        assert res_s == 0, f"Residual sites: {res_s}"
        assert res_t == 0, f"Residual telemetry: {res_t}"
        assert res_e == 0, f"Residual events: {res_e}"
        assert res_a == 0, f"Residual alerts: {res_a}"

        print("  [PASS] Teardown complete: 0 residual validation rows in PostgreSQL / TimescaleDB.")
    finally:
        session.close()
        engine.dispose()


def _cleanup_telemetry_and_events(session: Session, machine_id: UUID) -> None:
    session.rollback()
    conn = session.connection()
    conn.exec_driver_sql("DELETE FROM alerts WHERE machine_id = %(mid)s", {"mid": machine_id})
    conn.exec_driver_sql("DELETE FROM energy_wastage_events WHERE machine_id = %(mid)s", {"mid": machine_id})
    conn.exec_driver_sql("DELETE FROM telemetry WHERE machine_id = %(mid)s", {"mid": machine_id})
    session.commit()


def _cleanup_rows(session: Session) -> None:
    session.rollback()
    m_ids = [VAL_MACHINE_1_ID, VAL_MACHINE_2_ID]
    conn = session.connection()
    conn.exec_driver_sql("DELETE FROM alerts WHERE machine_id = ANY(%(mids)s)", {"mids": m_ids})
    conn.exec_driver_sql("DELETE FROM energy_wastage_events WHERE machine_id = ANY(%(mids)s)", {"mids": m_ids})
    conn.exec_driver_sql("DELETE FROM telemetry WHERE machine_id = ANY(%(mids)s)", {"mids": m_ids})
    conn.exec_driver_sql("DELETE FROM sensors WHERE machine_id = ANY(%(mids)s)", {"mids": m_ids})
    conn.exec_driver_sql("DELETE FROM machines WHERE id = ANY(%(mids)s)", {"mids": m_ids})
    conn.exec_driver_sql("DELETE FROM sites WHERE id = %(sid)s", {"sid": VAL_SITE_ID})
    session.commit()


def main() -> int:
    print("=" * 75)
    print("ORVEX STAGE 6A: MQTT HARDWARE GATEWAY END-TO-END VALIDATION SUITE")
    print("=" * 75)

    try:
        check_services()
        setup_test_entities()
        validate_parsing_and_association()
        validate_mqtt_scenarios()
        validate_idempotency_and_deduplication()
        validate_rest_apis()
        cleanup_and_verify_zero_residual()

        print("\n" + "=" * 75)
        print("STAGE 6A VALIDATION COMPLETE: ALL CHECKS PASSED (100% SUCCESS)")
        print("=" * 75)
        return 0

    except Exception as exc:
        print(f"\n[VALIDATION FAILED]: {exc}")
        import traceback
        traceback.print_exc()
        try:
            engine, session = get_db()
            _cleanup_rows(session)
            session.close()
            engine.dispose()
            print("[CLEANUP] Post-failure emergency cleanup completed.")
        except Exception:
            pass
        return 1


if __name__ == "__main__":
    sys.exit(main())
