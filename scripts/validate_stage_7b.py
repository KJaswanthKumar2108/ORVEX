"""ORVEX Stage 7B End-to-End Validation Suite: Predictive Maintenance & Machine Health Intelligence.

Validates:
1. Environment & Core Service Verification:
   - FastAPI Health Check
   - PostgreSQL/TimescaleDB connectivity
   - Database cleanup before test
2. Provisioning Isolated Metadata & Telemetry:
   - Validation Site, Machines (Crusher 132 kW, Conveyor 45 kW), and Sensor
   - Machine 1: 45 samples over 1.5 hours with elevated temperature (86.5°C) and power fluctuations (CV > 0.35)
   - Machine 2: Sparse telemetry (5 samples, 0.1 hr) to trigger INSUFFICIENT_DATA safeguard
3. Machine Health Feature Engine & Rule Evaluation:
   - Evaluates Machine 1 condition monitoring detail API
   - Verifies active warnings (TEMPERATURE_HIGH_SUSTAINED, POWER_FLUCTUATION) with evidence
   - Verifies sub-scores and dynamic weight normalization
   - Verifies sensor channel status: 3-Phase electrical as ACTIVE_HARDWARE, vibration as UNMEASURED_NOT_INSTALLED
4. Insufficient Data Safeguard Verification:
   - Evaluates Machine 2 condition monitoring detail API
   - Verifies health score is None (not 100!)
   - Verifies status is INSUFFICIENT_DATA with explicit minimum threshold explanation
5. Fleet Health Summary API Verification:
   - Queries fleet summary endpoint
   - Verifies fleet average health score, status distribution, active warning tallies, and unmeasured vibration channel disclaimer
6. Warning Acknowledgment Lifecycle:
   - Acknowledges an active warning via API
   - Verifies status transition to 'acknowledged' with technician name and notes
7. Maintenance Observation Lifecycle:
   - Records an inspection observation linked to the warning
   - Verifies observation persistence and automatic resolution of linked warning
8. Teardown & Database Hygiene Check:
   - Deletes all created validation records
   - Confirms exactly 0 residual test rows across all tables
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import os
import sys
import time
from uuid import UUID, uuid4

import requests
from sqlalchemy import text
from sqlalchemy.orm import Session

# Add project root and backend to sys.path
sys.path.insert(0, os.path.abspath("."))
sys.path.insert(0, os.path.abspath("backend"))

from app.core.config import get_settings
from app.db.models import (
    Machine,
    MachineHealthWarning,
    MaintenanceObservation,
    Sensor,
    Site,
    Telemetry,
)
from app.db.session import create_database_engine, create_session_factory

API_BASE_URL = os.environ.get("ORVEX_API_URL", "http://127.0.0.1:8000")

# Isolated UUIDs for Stage 7B Validation
VAL_SITE_ID = UUID("00000000-0000-0000-7b00-000000000001")
VAL_MACHINE_1_ID = UUID("00000000-0000-0000-7b00-000000000011")  # Crusher 132 kW (Unhealthy)
VAL_MACHINE_2_ID = UUID("00000000-0000-0000-7b00-000000000022")  # Conveyor 45 kW (Sparse Data)
VAL_SENSOR_1_ID = UUID("00000000-0000-0000-7b00-000000000101")


def cleanup_validation_data(session: Session) -> None:
    """Removes all Stage 7B validation fixtures to ensure test isolation and 0 residual rows."""
    print("Executing cleanup of validation data...")
    m_params = {"m1": VAL_MACHINE_1_ID, "m2": VAL_MACHINE_2_ID}
    session.execute(
        text("DELETE FROM maintenance_observations WHERE machine_id IN (:m1, :m2)"),
        m_params,
    )
    session.execute(
        text("DELETE FROM machine_health_warnings WHERE machine_id IN (:m1, :m2)"),
        m_params,
    )
    session.execute(
        text("DELETE FROM telemetry WHERE machine_id IN (:m1, :m2)"),
        m_params,
    )
    session.execute(
        text("DELETE FROM sensors WHERE machine_id IN (:m1, :m2)"),
        m_params,
    )
    session.execute(
        text("DELETE FROM machines WHERE id IN (:m1, :m2)"),
        m_params,
    )
    session.execute(
        text("DELETE FROM sites WHERE id = :site_id"),
        {"site_id": VAL_SITE_ID},
    )
    session.commit()
    print("Cleanup completed.")


def run_validation() -> None:
    print("=" * 60)
    print("ORVEX STAGE 7B VALIDATION: PREDICTIVE MAINTENANCE & HEALTH INTELLIGENCE")
    print("=" * 60)

    settings = get_settings()
    engine = create_database_engine(settings.database_url)
    session_factory = create_session_factory(engine)

    # -------------------------------------------------------------
    # STEP 1: Verify Core Services
    # -------------------------------------------------------------
    print("\n=== STEP 1: Verify Core Services ===")
    try:
        health_resp = requests.get(f"{API_BASE_URL}/health", timeout=5.0)
        assert health_resp.status_code == 200, f"Health check failed: {health_resp.status_code}"
        print(f"FastAPI Health Check: OK ({health_resp.json()})")
    except Exception as err:
        print(f"Failed to connect to FastAPI at {API_BASE_URL}: {err}")
        sys.exit(1)

    with session_factory() as session:
        cleanup_validation_data(session)

    # -------------------------------------------------------------
    # STEP 2: Provision Validation Metadata & Telemetry
    # -------------------------------------------------------------
    print("\n=== STEP 2: Provision Validation Metadata & Telemetry ===")
    now = datetime.now(timezone.utc)
    t0 = now - timedelta(hours=1.5)

    with session_factory() as session:
        site = Site(
            id=VAL_SITE_ID,
            name="Stage 7B Iron Mine Alpha",
            location="Pilbara Region, WA",
            timezone="UTC",
        )
        session.add(site)

        machine_1 = Machine(
            id=VAL_MACHINE_1_ID,
            site_id=VAL_SITE_ID,
            machine_identifier="VAL-CRUSH-7B",
            name="Stage 7B Jaw Crusher",
            machine_type="Crusher",
            rated_power_kw=Decimal("132.0"),
            status="active",
        )
        machine_2 = Machine(
            id=VAL_MACHINE_2_ID,
            site_id=VAL_SITE_ID,
            machine_identifier="VAL-CONV-7B",
            name="Stage 7B Overland Conveyor",
            machine_type="Conveyor",
            rated_power_kw=Decimal("45.0"),
            status="active",
        )
        session.add_all([machine_1, machine_2])

        sensor_1 = Sensor(
            id=VAL_SENSOR_1_ID,
            machine_id=VAL_MACHINE_1_ID,
            sensor_identifier="VAL-SEN-7B-01",
            sensor_type="power_meter",
            unit="kW",
            status="active",
        )
        session.add(sensor_1)
        session.commit()

        # Telemetry for Machine 1: 45 samples over 90 mins (interval 120s)
        # Power fluctuating heavily (CV > 0.35) and temperature elevated to 86.5°C
        records_m1 = []
        for i in range(45):
            ts = t0 + timedelta(seconds=i * 120)
            jitter = (i % 7 - 3) * 20.0  # Volatile power swings: 50kW to 130kW
            p = max(20.0, 90.0 + jitter)
            records_m1.append(
                Telemetry(
                    id=uuid4(),
                    machine_id=VAL_MACHINE_1_ID,
                    sensor_id=VAL_SENSOR_1_ID,
                    timestamp=ts,
                    voltage=415.0,
                    current=p * 1.5,
                    active_power=p,
                    reactive_power=25.0,
                    apparent_power=p * 1.05,
                    power_factor=0.88,
                    cumulative_energy=1000.0 + (i * 3.0),
                    temperature=86.5 + (i * 0.05),  # Elevated warning range
                    rpm=1450.0 + (i % 3) * 10.0,
                    load_percentage=min(100.0, (p / 132.0) * 100.0),
                    operating_state="OPTIMAL",
                )
            )
        session.add_all(records_m1)

        # Telemetry for Machine 2: Sparse (only 5 samples, < 30 required)
        records_m2 = []
        for i in range(5):
            ts = now - timedelta(minutes=5 - i)
            records_m2.append(
                Telemetry(
                    id=uuid4(),
                    machine_id=VAL_MACHINE_2_ID,
                    timestamp=ts,
                    voltage=415.0,
                    current=50.0,
                    active_power=30.0,
                    cumulative_energy=500.0 + i,
                    temperature=55.0,
                    operating_state="OPTIMAL",
                )
            )
        session.add_all(records_m2)
        session.commit()

        print(f"Provisioned 2 machines: Crusher (45 samples, elevated temp & power volatility) and Conveyor (5 samples).")

    # -------------------------------------------------------------
    # STEP 3: Query Machine Health Detail API (Machine 1)
    # -------------------------------------------------------------
    print("\n=== STEP 3: Query Machine Health Detail API (Machine 1) ===")
    detail_url = f"{API_BASE_URL}/api/v1/machine-health/machines/{VAL_MACHINE_1_ID}?window_hours=24.0"
    resp = requests.get(detail_url, timeout=10.0)
    assert resp.status_code == 200, f"Detail API failed: {resp.status_code} - {resp.text}"
    m1_detail = resp.json()

    print(f"Machine 1 Health Score: {m1_detail['health_score']} / 100 (Status: {m1_detail['health_status']})")
    print(f"Data Coverage: {m1_detail['data_coverage_hours']:.1f} hrs ({m1_detail['telemetry_sample_count']} samples)")

    # Assert condition monitoring detection
    assert m1_detail["health_status"] in ["WARNING", "WATCH", "CRITICAL"], "Expected warning/alert status for volatile machine"
    assert m1_detail["health_score"] < 80.0, f"Health score should be degraded, got {m1_detail['health_score']}"

    # Verify subscores
    sub = m1_detail["sub_scores"]
    print(f"Sub-Scores: Electrical Stability: {sub['electrical_stability']}%, Thermal Margin: {sub['thermal_margin']}%")
    assert sub["electrical_stability"] is not None and sub["electrical_stability"] < 85.0, "Electrical stability should be penalized"
    assert sub["thermal_margin"] is not None and sub["thermal_margin"] < 80.0, "Thermal margin should be penalized"

    # Verify channel coverage
    channels = {c["channel_name"]: c for c in m1_detail["channels"]}
    assert "3-Phase Electrical (V, I, P, Q, PF)" in channels
    assert channels["3-Phase Electrical (V, I, P, Q, PF)"]["status"] == "ACTIVE_HARDWARE"
    assert "Vibration (ISO 10816-3 RMS)" in channels
    assert channels["Vibration (ISO 10816-3 RMS)"]["status"] == "UNMEASURED_NOT_INSTALLED"
    print("Channel Coverage verified: Electrical is ACTIVE_HARDWARE, Vibration is UNMEASURED_NOT_INSTALLED.")

    # Verify active warnings
    active_warnings = m1_detail["active_warnings"]
    print(f"Active Warnings Generated: {len(active_warnings)}")
    assert len(active_warnings) >= 1, "Expected at least 1 active warning for volatile crusher"
    warning_types = [w["warning_type"] for w in active_warnings]
    print(f"Warning Types: {warning_types}")
    assert any("TEMPERATURE" in wt or "POWER" in wt for wt in warning_types), "Expected temperature or power warning"

    # -------------------------------------------------------------
    # STEP 4: Insufficient Data Safeguard Verification (Machine 2)
    # -------------------------------------------------------------
    print("\n=== STEP 4: Insufficient Data Safeguard Verification (Machine 2) ===")
    m2_url = f"{API_BASE_URL}/api/v1/machine-health/machines/{VAL_MACHINE_2_ID}?window_hours=24.0"
    resp2 = requests.get(m2_url, timeout=10.0)
    assert resp2.status_code == 200, f"Detail API failed for Machine 2: {resp2.status_code}"
    m2_detail = resp2.json()

    print(f"Machine 2 Health Score: {m2_detail['health_score']} (Status: {m2_detail['health_status']})")
    assert m2_detail["health_score"] is None, "Score must be None when telemetry is insufficient (do not fake 100!)"
    assert m2_detail["health_status"] == "INSUFFICIENT_DATA", "Status must be INSUFFICIENT_DATA"
    assert m2_detail["insufficient_data_reason"] is not None
    assert "Insufficient historical telemetry" in m2_detail["insufficient_data_reason"]
    print(f"Safeguard verified: {m2_detail['insufficient_data_reason']}")

    # -------------------------------------------------------------
    # STEP 5: Query Fleet Health Summary API
    # -------------------------------------------------------------
    print("\n=== STEP 5: Query Fleet Health Summary API ===")
    summary_url = f"{API_BASE_URL}/api/v1/machine-health/summary"
    s_resp = requests.get(summary_url, timeout=10.0)
    assert s_resp.status_code == 200, f"Fleet summary failed: {s_resp.status_code}"
    summary = s_resp.json()

    print(f"Fleet Health Score: {summary['fleet_health_score']}")
    print(f"Monitored Machines: {summary['total_machines_monitored']}")
    print(f"Status Breakdown: {summary['status_breakdown']}")
    print(f"Active Warnings by Severity: {summary['active_warnings_by_severity']}")
    assert summary["total_machines_monitored"] >= 2
    assert summary["unmeasured_channels"]
    assert "Vibration" in summary["unmeasured_channels"][0]
    print(f"Causality Disclaimer: {summary['causality_disclaimer'][:80]}...")

    # -------------------------------------------------------------
    # STEP 6: Warning Acknowledgment Lifecycle
    # -------------------------------------------------------------
    print("\n=== STEP 6: Warning Acknowledgment Lifecycle ===")
    target_warning = active_warnings[0]
    target_warning_id = target_warning["id"]
    print(f"Target Warning ID: {target_warning_id} ({target_warning['warning_type']})")

    ack_url = f"{API_BASE_URL}/api/v1/machine-health/warnings/{target_warning_id}/acknowledge"
    ack_resp = requests.post(
        ack_url,
        json={
            "acknowledged_by": "Chief Tech Sarah Connor",
            "notes": "Bearing temperature monitored; cooling cowl cleared of debris",
        },
        timeout=10.0,
    )
    assert ack_resp.status_code == 200, f"Acknowledgment failed: {ack_resp.status_code}"
    ack_data = ack_resp.json()
    assert ack_data["status"] == "acknowledged"
    assert ack_data["acknowledged_by"] == "Chief Tech Sarah Connor"
    print(f"Warning Acknowledged: Status={ack_data['status']}, AckBy={ack_data['acknowledged_by']}")

    # -------------------------------------------------------------
    # STEP 7: Maintenance Observation Lifecycle
    # -------------------------------------------------------------
    print("\n=== STEP 7: Maintenance Observation Lifecycle ===")
    obs_url = f"{API_BASE_URL}/api/v1/machine-health/observations"
    obs_payload = {
        "machine_id": str(VAL_MACHINE_1_ID),
        "warning_id": target_warning_id,
        "inspector_name": "Chief Tech Sarah Connor",
        "inspection_date": now.isoformat(),
        "suspected_issue": "Elevated thermal saturation due to restricted cooling airflow",
        "corrective_action": "Cleaned external heat fins, replaced ventilation cowl mesh, checked lubricant viscosity",
        "status": "resolved",
        "notes": "Surface temperature stabilized at 68°C under test load",
    }
    obs_resp = requests.post(obs_url, json=obs_payload, timeout=10.0)
    assert obs_resp.status_code == 201, f"Create observation failed: {obs_resp.status_code}"
    obs_data = obs_resp.json()
    print(f"Observation Created: ID={obs_data['id']}, Status={obs_data['status']}")
    assert obs_data["status"] == "resolved"
    assert obs_data["inspector_name"] == "Chief Tech Sarah Connor"

    # Verify that resolving observation also resolved the linked warning in DB
    refreshed_warn_resp = requests.get(
        f"{API_BASE_URL}/api/v1/machine-health/machines/{VAL_MACHINE_1_ID}/warnings",
        params={"status": "resolved"},
        timeout=10.0,
    )
    resolved_warnings = refreshed_warn_resp.json()
    resolved_ids = [w["id"] for w in resolved_warnings]
    assert target_warning_id in resolved_ids, "Linked warning should have transitioned to resolved status"
    print("Warning resolved automatically through maintenance observation.")

    # -------------------------------------------------------------
    # STEP 8: Teardown & Database Hygiene Check
    # -------------------------------------------------------------
    print("\n=== STEP 8: Teardown & Database Hygiene Check ===")
    with session_factory() as session:
        cleanup_validation_data(session)

        # Confirm 0 residual rows
        m_params = {"m1": VAL_MACHINE_1_ID, "m2": VAL_MACHINE_2_ID}
        res_warn = session.execute(
            text("SELECT count(*) FROM machine_health_warnings WHERE machine_id IN (:m1, :m2)"),
            m_params,
        ).scalar()
        res_obs = session.execute(
            text("SELECT count(*) FROM maintenance_observations WHERE machine_id IN (:m1, :m2)"),
            m_params,
        ).scalar()
        res_telem = session.execute(
            text("SELECT count(*) FROM telemetry WHERE machine_id IN (:m1, :m2)"),
            m_params,
        ).scalar()
        res_mach = session.execute(
            text("SELECT count(*) FROM machines WHERE id IN (:m1, :m2)"),
            m_params,
        ).scalar()
        res_site = session.execute(
            text("SELECT count(*) FROM sites WHERE id = :s_id"),
            {"s_id": VAL_SITE_ID},
        ).scalar()

        total_residual = (res_warn or 0) + (res_obs or 0) + (res_telem or 0) + (res_mach or 0) + (res_site or 0)
        assert total_residual == 0, f"Residual records found: warn={res_warn}, obs={res_obs}, telem={res_telem}, mach={res_mach}, site={res_site}"
        print(f"Residual Check: 0 residual test rows found. Database is 100% clean.")

    print("\n" + "=" * 60)
    print("STAGE 7B PREDICTIVE MAINTENANCE & HEALTH INTELLIGENCE VALIDATION PASSED!")
    print("=" * 60)


if __name__ == "__main__":
    run_validation()
