"""ORVEX Stage 5A Complete End-to-End Validation Suite.

Validates:
1. Database Schema & Alembic Migration head (0003_alert_event_link)
2. In-App Alert Generation across all 5 simulator scenarios:
   - normal -> 0 events, 0 alerts
   - idle_wastage -> 1 event, 1 alert (IDLE_WASTAGE)
   - low_load_wastage -> 1 event, 1 alert (LOW_LOAD_WASTAGE)
   - abnormal_power -> 1 event, 1 alert (ABNORMAL_POWER)
   - start_stop_cycling -> 1 event, 1 alert (START_STOP_CYCLING), NULL wasted energy preserved
3. Alert Idempotency:
   - Re-running pipeline produces 0 duplicate alerts and 0 duplicate events
4. Alert Lifecycle API:
   - acknowledge, resolve (resolved_at populated), dismiss
   - Machine alerts endpoint GET /api/v1/machines/{id}/alerts
5. Energy-Wastage Reports API:
   - JSON report structure and breakdowns
   - RFC 4180 CSV export with metadata comments and units
6. Cleanup verification:
   - 0 residual rows in test database
"""

from __future__ import annotations

import csv
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import io
import os
import sys
from typing import Any
from uuid import UUID, uuid4

import requests
from sqlalchemy import func, inspect, select, text
from sqlalchemy.orm import Session

# Add project root and backend to sys.path
sys.path.insert(0, os.path.abspath("."))
sys.path.insert(0, os.path.abspath("backend"))

from analytics.config import DetectionConfig
from analytics.models import OperatingState
from app.core.config import get_settings
from app.db.models import Alert, EnergyWastageEvent, Machine, Site, Telemetry
from app.db.session import create_database_engine, create_session_factory
from app.repositories.alert_repository import AlertRepository
from app.repositories.wastage_event_repository import WastageEventRepository
from app.services.alert_service import AlertService
from app.services.analytics_orchestrator import AnalyticsOrchestrator
from app.services.wastage_event_service import WastageEventService
from simulator.generator import TelemetryGenerator
from simulator.models import Scenario
from simulator.profiles import DEFAULT_PROFILE
from simulator.scenarios import ScenarioController

API_BASE_URL = os.environ.get("ORVEX_API_URL", "http://127.0.0.1:8000")

# Validation site and machine IDs (isolated from demo IDs)
VAL_SITE_ID = UUID("00000000-0000-0000-5a00-000000000001")
VAL_MACHINE_ID = UUID("00000000-0000-0000-5a00-000000000010")

FAST_CONFIG = DetectionConfig(
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


def get_db():
    settings = get_settings()
    engine = create_database_engine(settings.database_url)
    session_factory = create_session_factory(engine)
    return engine, session_factory()


def check_api_health():
    print("1. Checking FastAPI health...")
    resp = requests.get(f"{API_BASE_URL}/health", timeout=3.0)
    assert resp.status_code == 200, f"Health check failed: {resp.status_code}"
    assert resp.json().get("status") == "ok"
    print("   [PASS] FastAPI is ONLINE and healthy.\n")


def check_database_schema():
    print("2. Checking database schema and migration head...")
    engine, session = get_db()
    try:
        insp = inspect(engine)
        columns = {col["name"]: col for col in insp.get_columns("alerts")}
        assert "event_id" in columns, "alerts.event_id column missing"
        assert "title" in columns, "alerts.title column missing"

        # Check unique partial index or constraint on event_id
        indexes = insp.get_indexes("alerts")
        has_event_idx = any(
            "event_id" in idx["column_names"] for idx in indexes
        )
        assert has_event_idx, "Missing index on alerts.event_id"

        # Check alembic current revision
        result = session.execute(text("SELECT version_num FROM alembic_version")).scalar()
        assert result == "0003_alert_event_link", f"Unexpected alembic version: {result}"
        print(f"   [PASS] Alembic head is {result}. Alerts schema verified.\n")
    finally:
        session.close()
        engine.dispose()


def setup_validation_machine(session: Session, m_id: UUID, identifier: str, m_type: str, rated_kw: float):
    site = session.get(Site, VAL_SITE_ID)
    if not site:
        site = Site(
            id=VAL_SITE_ID,
            name="Stage 5A Validation Facility",
            location="Validation Test Bench",
            timezone="UTC",
        )
        session.add(site)
        session.flush()

    machine = session.get(Machine, m_id)
    if not machine:
        machine = Machine(
            id=m_id,
            site_id=VAL_SITE_ID,
            machine_identifier=identifier,
            name=f"Validation {identifier}",
            machine_type=m_type,
            rated_power_kw=Decimal(str(rated_kw)),
            status="active",
        )
        session.add(machine)
        session.flush()
    return machine


def run_single_scenario(
    scenario: Scenario,
    m_id: UUID,
    identifier: str,
    num_samples: int = 30,
) -> tuple[int, int, list[dict[str, Any]], list[dict[str, Any]]]:
    engine, session = get_db()
    try:
        setup_validation_machine(session, m_id, identifier, "conveyor", 132.0)
        session.commit()
    finally:
        session.close()
        engine.dispose()

    controller = ScenarioController(scenario, DEFAULT_PROFILE)
    generator = TelemetryGenerator(machine_id=m_id, profile=DEFAULT_PROFILE, interval_seconds=1.0)
    start_time = datetime.now(timezone.utc) - timedelta(seconds=num_samples + 5)

    submitted = 0
    for s in range(num_samples):
        step = controller.step_at(float(s))
        rec = generator.generate(
            step.state,
            timestamp=start_time + timedelta(seconds=s),
            state_elapsed_seconds=step.state_elapsed_seconds,
            power_multiplier=step.power_multiplier,
            load_fraction=step.load_fraction,
        )
        resp = requests.post(f"{API_BASE_URL}/api/v1/telemetry", json=rec.to_payload(), timeout=3.0)
        assert resp.status_code == 201
        submitted += 1

    # End with stopped sample
    stop_rec = generator.generate(step.state, timestamp=start_time + timedelta(seconds=num_samples))
    payload = stop_rec.to_payload()
    payload["operating_state"] = "stopped"
    payload["active_power"] = 0.0
    requests.post(f"{API_BASE_URL}/api/v1/telemetry", json=payload, timeout=3.0)
    submitted += 1

    # Process via orchestrator in fast mode
    engine, session = get_db()
    try:
        orchestrator = AnalyticsOrchestrator(
            session=session,
            config=FAST_CONFIG,
        )
        res = orchestrator.process_machine(m_id, finalize_ongoing=True)
        session.commit()
    finally:
        session.close()
        engine.dispose()

    # Query API endpoints
    ev_resp = requests.get(f"{API_BASE_URL}/api/v1/machines/{m_id}/wastage-events", timeout=3.0).json()
    al_resp = requests.get(f"{API_BASE_URL}/api/v1/machines/{m_id}/alerts", timeout=3.0).json()

    events = ev_resp.get("items", [])
    alerts = al_resp.get("items", [])
    return submitted, res.finalized_count, events, alerts


def validate_5_scenarios():
    print("3. Validating 5 Simulator Scenarios End-to-End...")

    test_matrix = [
        ("normal", Scenario.NORMAL_OPERATION, UUID("00000000-0000-0000-5a00-000000000011"), "VAL-NORM-01", 25, 0, 0),
        ("idle_wastage", Scenario.IDLE_WASTAGE, UUID("00000000-0000-0000-5a00-000000000012"), "VAL-IDLE-02", 25, 1, 1),
        ("low_load_wastage", Scenario.LOW_LOAD_WASTAGE, UUID("00000000-0000-0000-5a00-000000000013"), "VAL-LOAD-03", 25, 1, 1),
        ("abnormal_power", Scenario.ABNORMAL_POWER, UUID("00000000-0000-0000-5a00-000000000014"), "VAL-ABN-04", 25, 1, 1),
        ("start_stop_cycling", Scenario.START_STOP_CYCLING, UUID("00000000-0000-0000-5a00-000000000015"), "VAL-CYCL-05", 60, 1, 1),
    ]

    for name, scen, m_id, ident, samples, expected_ev, expected_al in test_matrix:
        print(f"   Testing scenario: {name.upper()} on {ident}...")
        sub, fin, events, alerts = run_single_scenario(scen, m_id, ident, samples)
        assert len(events) == expected_ev, f"Expected {expected_ev} events, got {len(events)}"
        assert len(alerts) == expected_al, f"Expected {expected_al} alerts, got {len(alerts)}"

        if expected_ev > 0:
            ev = events[0]
            al = alerts[0]
            assert al["event_id"] == ev["id"], "Alert is not linked to event ID"
            assert al["status"] == "open", f"Alert status should be open, got {al['status']}"
            assert al["recommendation"], "Alert recommendation must not be empty"

            if name == "start_stop_cycling":
                assert ev["estimated_wasted_energy_kwh"] is None, "Cycling event wasted energy must be NULL"
            else:
                assert ev["estimated_wasted_energy_kwh"] is not None, f"Expected numeric wasted energy for {name}"
                assert ev["estimated_wasted_energy_kwh"] > 0

        print(f"   [PASS] {name}: {len(events)} events, {len(alerts)} alerts verified.")
    print()


def validate_idempotency():
    print("4. Validating Idempotency...")
    # Target the idle machine
    m_id = UUID("00000000-0000-0000-5a00-000000000012")
    engine, session = get_db()
    try:
        ev_before = session.scalar(select(func.count()).select_from(EnergyWastageEvent).where(EnergyWastageEvent.machine_id == m_id))
        al_before = session.scalar(select(func.count()).select_from(Alert).where(Alert.machine_id == m_id))

        # Re-run pipeline on the existing telemetry
        orchestrator = AnalyticsOrchestrator(session=session, config=FAST_CONFIG)
        res = orchestrator.process_machine(m_id, finalize_ongoing=True)
        session.commit()

        ev_after = session.scalar(select(func.count()).select_from(EnergyWastageEvent).where(EnergyWastageEvent.machine_id == m_id))
        al_after = session.scalar(select(func.count()).select_from(Alert).where(Alert.machine_id == m_id))

        assert ev_after == ev_before, f"Duplicate events created! Before: {ev_before}, After: {ev_after}"
        assert al_after == al_before, f"Duplicate alerts created! Before: {al_before}, After: {al_after}"
        print(f"   [PASS] Pipeline re-run produced 0 duplicate events and 0 duplicate alerts (count: {al_after}).\n")
    finally:
        session.close()
        engine.dispose()


def validate_alert_lifecycle():
    print("5. Validating Alert Lifecycle API...")
    m_id = UUID("00000000-0000-0000-5a00-000000000012")
    al_resp = requests.get(f"{API_BASE_URL}/api/v1/machines/{m_id}/alerts").json()
    assert len(al_resp["items"]) == 1
    alert = al_resp["items"][0]
    alert_id = alert["id"]
    assert alert["status"] == "open"
    assert alert["resolved_at"] is None

    # 1. Acknowledge
    ack_resp = requests.post(
        f"{API_BASE_URL}/api/v1/alerts/{alert_id}/acknowledge",
        json={"comment": "Acknowledged by validation suite"},
    )
    assert ack_resp.status_code == 200
    ack_data = ack_resp.json()
    assert ack_data["status"] == "acknowledged"
    assert ack_data["resolved_at"] is None
    print("   [PASS] POST /alerts/{id}/acknowledge -> status: acknowledged")

    # 2. Resolve
    res_resp = requests.post(
        f"{API_BASE_URL}/api/v1/alerts/{alert_id}/resolve",
        json={"resolution_notes": "Issue corrected by test suite"},
    )
    assert res_resp.status_code == 200
    res_data = res_resp.json()
    assert res_data["status"] == "resolved"
    assert res_data["resolved_at"] is not None
    print("   [PASS] POST /alerts/{id}/resolve -> status: resolved with timestamp")

    # 3. Dismiss on another alert (e.g. low-load alert)
    m_id_load = UUID("00000000-0000-0000-5a00-000000000013")
    load_alerts = requests.get(f"{API_BASE_URL}/api/v1/machines/{m_id_load}/alerts").json()["items"]
    load_alert_id = load_alerts[0]["id"]

    dis_resp = requests.post(f"{API_BASE_URL}/api/v1/alerts/{load_alert_id}/dismiss")
    assert dis_resp.status_code == 200
    dis_data = dis_resp.json()
    assert dis_data["status"] == "dismissed"
    print("   [PASS] POST /alerts/{id}/dismiss -> status: dismissed\n")


def validate_reports_and_csv():
    print("6. Validating Energy-Wastage Reports API & RFC 4180 CSV Export...")
    # JSON report
    rep_resp = requests.get(f"{API_BASE_URL}/api/v1/reports/energy-wastage")
    assert rep_resp.status_code == 200
    rep = rep_resp.json()

    assert rep["total_wastage_events"] == 4, f"Expected 4 total events, got {rep['total_wastage_events']}"
    assert rep["unestimated_wastage_events"] == 1, f"Expected 1 unestimated event (cycling), got {rep['unestimated_wastage_events']}"
    assert rep["actual_energy_kwh"] is not None and rep["actual_energy_kwh"] > 0
    assert rep["estimated_wasted_energy_kwh"] is not None and rep["estimated_wasted_energy_kwh"] > 0
    assert len(rep["by_reason"]) == 4, f"Expected 4 reason groups, got {len(rep['by_reason'])}"
    assert len(rep["by_machine"]) == 5, f"Expected 5 validation machines, got {len(rep['by_machine'])}"

    # Check that START_STOP_CYCLING reason has None wasted energy and unestimated_event_count == 1
    cycling_reason = next(r for r in rep["by_reason"] if r["reason"] == "START_STOP_CYCLING")
    assert cycling_reason["estimated_wasted_energy_kwh"] is None
    assert cycling_reason["unestimated_event_count"] == 1
    print("   [PASS] JSON report verified: consumption, wasted kWh, unestimated cycling breakdown.")

    # CSV report
    csv_resp = requests.get(f"{API_BASE_URL}/api/v1/reports/energy-wastage/csv")
    assert csv_resp.status_code == 200
    assert "text/csv" in csv_resp.headers["Content-Type"]
    assert "attachment; filename=" in csv_resp.headers.get("Content-Disposition", "")

    csv_text = csv_resp.text
    assert "# ORVEX Energy Wastage Report" in csv_text
    assert "# Measured Actual Energy (kWh)" in csv_text
    assert "# Estimated Potential Wastage (kWh)" in csv_text
    assert "--- SUMMARY BY DETECTION REASON ---" in csv_text
    assert "--- SUMMARY BY EQUIPMENT ---" in csv_text
    assert "--- DETAILED WASTAGE EVENT LOG ---" in csv_text
    assert "START_STOP_CYCLING" in csv_text
    assert "N/A (unquantified)" in csv_text

    # Verify RFC 4180 parsing
    reader = csv.reader(io.StringIO(csv_text))
    rows = list(reader)
    assert len(rows) > 15
    print("   [PASS] RFC 4180 CSV export verified with units and metadata.\n")


def cleanup_validation_data():
    print("7. Cleaning up validation test data...")
    engine, session = get_db()
    try:
        with session.get_bind().begin() as conn:
            conn.exec_driver_sql("DELETE FROM alerts WHERE machine_id IN (SELECT id FROM machines WHERE site_id = %(sid)s)", {"sid": VAL_SITE_ID})
            conn.exec_driver_sql("DELETE FROM energy_wastage_events WHERE machine_id IN (SELECT id FROM machines WHERE site_id = %(sid)s)", {"sid": VAL_SITE_ID})
            conn.exec_driver_sql("DELETE FROM telemetry WHERE machine_id IN (SELECT id FROM machines WHERE site_id = %(sid)s)", {"sid": VAL_SITE_ID})
            conn.exec_driver_sql("DELETE FROM machines WHERE site_id = %(sid)s", {"sid": VAL_SITE_ID})
            conn.exec_driver_sql("DELETE FROM sites WHERE id = %(sid)s", {"sid": VAL_SITE_ID})

        # Verify 0 residual rows
        al_rem = session.scalar(select(func.count()).select_from(Alert)) or 0
        ev_rem = session.scalar(select(func.count()).select_from(EnergyWastageEvent)) or 0
        tel_rem = session.scalar(select(func.count()).select_from(Telemetry)) or 0
        m_rem = session.scalar(select(func.count()).select_from(Machine)) or 0
        s_rem = session.scalar(select(func.count()).select_from(Site)) or 0

        assert al_rem == 0, f"Residual alerts remain: {al_rem}"
        assert ev_rem == 0, f"Residual events remain: {ev_rem}"
        assert tel_rem == 0, f"Residual telemetry remains: {tel_rem}"
        assert m_rem == 0, f"Residual machines remain: {m_rem}"
        assert s_rem == 0, f"Residual sites remain: {s_rem}"
        print(f"   [PASS] Validation test data safely cleaned up. Database has 0 residual rows.\n")
    finally:
        session.close()
        engine.dispose()


def main():
    print("=" * 75)
    print("ORVEX STAGE 5A COMPREHENSIVE END-TO-END VALIDATION SUITE")
    print("=" * 75 + "\n")

    try:
        check_api_health()
        check_database_schema()
        validate_5_scenarios()
        validate_idempotency()
        validate_alert_lifecycle()
        validate_reports_and_csv()
    finally:
        cleanup_validation_data()

    print("=" * 75)
    print("ALL STAGE 5A VALIDATION TESTS PASSED SUCCESSFULLY!")
    print("=" * 75)


if __name__ == "__main__":
    main()

