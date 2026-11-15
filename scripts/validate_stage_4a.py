"""Stage 4A End-to-End Integration Validation Script

Validates the read-only REST API endpoints:
- GET /api/v1/machines
- GET /api/v1/machines/{machine_id}
- GET /api/v1/machines/{machine_id}/summary
- GET /api/v1/machines/{machine_id}/telemetry
- GET /api/v1/machines/{machine_id}/energy-summary
- GET /api/v1/machines/{machine_id}/wastage-events
- GET /api/v1/wastage-events
- GET /api/v1/wastage-events/{event_id}

Uses the real development TimescaleDB database, the simulator, the existing ingestion endpoint,
and verifies automated detection, read queries, energy analytics calculations, and complete cleanup.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import os
import sys
import time
from typing import Any
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

# Add project root and backend to sys.path
sys.path.insert(0, os.path.abspath("."))
sys.path.insert(0, os.path.abspath("backend"))

from analytics.config import DetectionConfig
from app.api.routes.telemetry import get_telemetry_service
from app.core.config import get_settings
from app.db.models import EnergyWastageEvent, Machine, Site, Telemetry
from app.db.session import create_database_engine, create_session_factory
from app.main import create_app
from app.repositories.telemetry_repository import TelemetryRepository
from app.repositories.wastage_event_repository import WastageEventRepository
from app.services.analytics_orchestrator import AnalyticsOrchestrator
from app.services.telemetry_service import TelemetryService
from app.services.wastage_event_service import WastageEventService
from simulator.generator import TelemetryGenerator
from simulator.models import Scenario
from simulator.profiles import DEFAULT_PROFILE
from simulator.scenarios import ScenarioController

# Isolated test detection config with shortened thresholds for test validation
TEST_DETECTION_CONFIG = DetectionConfig(
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


def format_iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def main() -> int:
    settings = get_settings()
    engine = create_database_engine(settings.database_url)
    session_factory = create_session_factory(engine)
    session: Session = session_factory()
    app = create_app()

    print("=" * 80)
    print("ORVEX STAGE 4A: READ-ONLY ANALYTICS API END-TO-END VALIDATION")
    print("=" * 80)

    site_id = uuid4()
    machine_id = uuid4()
    cycling_machine_id = uuid4()
    normal_machine_id = uuid4()
    created_machine_ids = [machine_id, cycling_machine_id, normal_machine_id]

    # Setup dependency override for ingestion with test config for rapid deterministic detection
    def override_telemetry_service() -> TelemetryService:
        t_repo = TelemetryRepository(session)
        w_repo = WastageEventRepository(session)
        w_service = WastageEventService(w_repo)
        orchestrator = AnalyticsOrchestrator(
            session=session,
            persistence_service=w_service,
            config=TEST_DETECTION_CONFIG,
        )
        return TelemetryService(t_repo, orchestrator=orchestrator)

    app.dependency_overrides[get_telemetry_service] = override_telemetry_service
    app.state.session_factory = session_factory
    client = TestClient(app)
    client.__enter__()

    all_passed = True

    try:
        # 1. Create temporary site and machines in DB
        site = Site(id=site_id, name=f"Val4A-Site-{uuid4().hex[:6]}", timezone="UTC")
        session.add(site)
        session.flush()

        machine = Machine(
            id=machine_id,
            site_id=site.id,
            machine_identifier=f"Val4A-Idle-{uuid4().hex[:6]}",
            name="Val4A Idle Machine",
            machine_type="conveyor",
            rated_power_kw=Decimal("132.0"),
            status="active",
        )
        cycling_machine = Machine(
            id=cycling_machine_id,
            site_id=site.id,
            machine_identifier=f"Val4A-Cycle-{uuid4().hex[:6]}",
            name="Val4A Cycling Machine",
            machine_type="pump",
            rated_power_kw=Decimal("75.0"),
            status="active",
        )
        normal_machine = Machine(
            id=normal_machine_id,
            site_id=site.id,
            machine_identifier=f"Val4A-Norm-{uuid4().hex[:6]}",
            name="Val4A Normal Machine",
            machine_type="fan",
            rated_power_kw=Decimal("55.0"),
            status="active",
        )
        session.add_all([machine, cycling_machine, normal_machine])
        session.commit()
        print("\n[STEP 1] Created temporary site and 3 machines.")

        # 2. Test GET /api/v1/machines (listing and pagination)
        resp = client.get("/api/v1/machines?limit=10&offset=0")
        assert resp.status_code == 200, f"GET /machines returned {resp.status_code}"
        m_list = resp.json()
        assert m_list["total"] >= 3, f"Expected at least 3 machines, got {m_list['total']}"
        found_ids = {item["id"] for item in m_list["items"]}
        assert str(machine_id) in found_ids, "Created machine not found in /machines list"
        print("  [PASS] GET /api/v1/machines returns paginated machine list.")

        # 3. Test GET /api/v1/machines/{id} (details)
        resp = client.get(f"/api/v1/machines/{machine_id}")
        assert resp.status_code == 200
        m_data = resp.json()
        assert m_data["name"] == "Val4A Idle Machine"
        assert m_data["rated_power_kw"] == 132.0
        print("  [PASS] GET /api/v1/machines/{id} returns accurate machine details.")

        # Test unknown machine ID returns 404
        resp = client.get(f"/api/v1/machines/{uuid4()}")
        assert resp.status_code == 404
        print("  [PASS] GET /api/v1/machines/{unknown_id} returns 404.")

        # 4. Test GET /api/v1/machines/{id}/summary before telemetry (missing freshness)
        resp = client.get(f"/api/v1/machines/{machine_id}/summary")
        assert resp.status_code == 200
        sum_data = resp.json()
        assert sum_data["telemetry_freshness"] == "missing"
        assert sum_data["latest_telemetry_timestamp"] is None
        print("  [PASS] GET /api/v1/machines/{id}/summary returns 'missing' when no telemetry exists.")

        # 5. Ingest Telemetry via POST /api/v1/telemetry for idle machine (triggers pipeline)
        print("\n[STEP 2] Ingesting simulated telemetry through POST /api/v1/telemetry...")
        controller = ScenarioController(Scenario.IDLE_WASTAGE, DEFAULT_PROFILE)
        generator = TelemetryGenerator(machine_id=machine.id, interval_seconds=1.0)
        start_time = datetime.now(timezone.utc) - timedelta(seconds=30)

        for s in range(20):
            step = controller.step_at(float(s))
            rec = generator.generate(
                step.state,
                timestamp=start_time + timedelta(seconds=s),
                state_elapsed_seconds=step.state_elapsed_seconds,
                power_multiplier=step.power_multiplier,
            )
            r = client.post("/api/v1/telemetry", json=rec.to_payload())
            assert r.status_code == 201

        # Concluding STOPPED record to finalize idle wastage event
        stop_rec = generator.generate(
            step.state,
            timestamp=start_time + timedelta(seconds=20),
        )
        stop_payload = stop_rec.to_payload()
        stop_payload["operating_state"] = "stopped"
        stop_payload["active_power"] = 0.0
        r = client.post("/api/v1/telemetry", json=stop_payload)
        assert r.status_code == 201
        print("  [PASS] Ingested 21 telemetry records; automated analytics triggered.")

        # 6. Test GET /api/v1/machines/{id}/summary after telemetry (fresh/stopped)
        resp = client.get(f"/api/v1/machines/{machine_id}/summary")
        assert resp.status_code == 200
        sum_data = resp.json()
        assert sum_data["telemetry_freshness"] in {"fresh", "stale"}
        assert sum_data["latest_operating_state"] == "stopped"
        assert sum_data["latest_active_power"] == 0.0
        assert sum_data["latest_telemetry_timestamp"] is not None
        print(f"  [PASS] GET /api/v1/machines/{id}/summary updated: freshness={sum_data['telemetry_freshness']}, state=stopped.")

        # 7. Test GET /api/v1/machines/{id}/telemetry (range & pagination)
        t_start_iso = format_iso(start_time)
        t_end_iso = format_iso(start_time + timedelta(seconds=25))
        resp = client.get(f"/api/v1/machines/{machine_id}/telemetry?start_time={t_start_iso}&end_time={t_end_iso}&limit=10&offset=0")
        assert resp.status_code == 200
        t_data = resp.json()
        assert t_data["total"] == 21, f"Expected 21 telemetry records, got {t_data['total']}"
        assert len(t_data["items"]) == 10, f"Expected 10 items on page 1, got {len(t_data['items'])}"
        print("  [PASS] GET /api/v1/machines/{id}/telemetry returns paginated range query.")

        # 8. Test GET /api/v1/machines/{id}/energy-summary
        resp = client.get(f"/api/v1/machines/{machine_id}/energy-summary?start_time={t_start_iso}&end_time={t_end_iso}")
        assert resp.status_code == 200
        e_data = resp.json()
        assert e_data["telemetry_sample_count"] == 21
        assert e_data["actual_energy_kwh"] is not None and e_data["actual_energy_kwh"] > 0
        assert e_data["estimated_wasted_energy_kwh"] is not None and e_data["estimated_wasted_energy_kwh"] > 0
        assert e_data["wastage_event_count"] >= 1
        assert e_data["idle_duration_seconds"] > 0
        assert e_data["data_coverage_ratio"] > 0
        print(f"  [PASS] GET /api/v1/machines/{id}/energy-summary: actual={e_data['actual_energy_kwh']:.4f} kWh, wasted={e_data['estimated_wasted_energy_kwh']:.4f} kWh, quality={e_data['quality']}.")

        # 9. Test GET /api/v1/machines/{id}/wastage-events and GET /api/v1/wastage-events
        resp = client.get(f"/api/v1/machines/{machine_id}/wastage-events")
        assert resp.status_code == 200
        events_data = resp.json()
        assert events_data["total"] >= 1
        event_id = events_data["items"][0]["id"]
        reason = events_data["items"][0]["detection_reason"]
        print(f"  [PASS] GET /api/v1/machines/{id}/wastage-events returns persisted events (reason: {reason}).")

        # GET /api/v1/wastage-events (global with filter)
        resp = client.get(f"/api/v1/wastage-events?machine_id={machine_id}&status=detected")
        assert resp.status_code == 200
        assert resp.json()["total"] >= 1
        print("  [PASS] GET /api/v1/wastage-events supports machine_id and status filters.")

        # GET /api/v1/wastage-events/{event_id}
        resp = client.get(f"/api/v1/wastage-events/{event_id}")
        assert resp.status_code == 200
        ev_detail = resp.json()
        assert ev_detail["id"] == event_id
        assert ev_detail["machine_id"] == str(machine_id)
        print("  [PASS] GET /api/v1/wastage-events/{id} returns individual event details.")

        # 10. Ingest Normal scenario and verify 0 false wastage events
        print("\n[STEP 3] Ingesting Normal scenario telemetry...")
        norm_ctrl = ScenarioController(Scenario.NORMAL_OPERATION, DEFAULT_PROFILE)
        norm_gen = TelemetryGenerator(machine_id=normal_machine.id, interval_seconds=1.0)
        norm_start = datetime.now(timezone.utc) - timedelta(seconds=25)
        for s in range(20):
            step = norm_ctrl.step_at(float(s))
            rec = norm_gen.generate(step.state, timestamp=norm_start + timedelta(seconds=s))
            r = client.post("/api/v1/telemetry", json=rec.to_payload())
            assert r.status_code == 201

        resp = client.get(f"/api/v1/machines/{normal_machine.id}/wastage-events")
        assert resp.status_code == 200
        assert resp.json()["total"] == 0, "Normal machine generated unexpected wastage events!"
        print("  [PASS] Normal operation produced exactly 0 wastage events.")

    except Exception as exc:
        all_passed = False
        print(f"\n[ERROR] Validation failed with: {exc}")
        import traceback
        traceback.print_exc()

    finally:
        client.__exit__(None, None, None)
        app.dependency_overrides.clear()

        # Clean up all temporary test records
        print("\n[STEP 4] Cleaning up temporary validation records...")
        session.rollback()
        with session.get_bind().begin() as conn:
            conn.exec_driver_sql(
                "DELETE FROM energy_wastage_events WHERE machine_id = ANY(%(mids)s)",
                {"mids": created_machine_ids},
            )
            conn.exec_driver_sql(
                "DELETE FROM telemetry WHERE machine_id = ANY(%(mids)s)",
                {"mids": created_machine_ids},
            )
            conn.exec_driver_sql(
                "DELETE FROM machines WHERE id = ANY(%(mids)s)",
                {"mids": created_machine_ids},
            )
            conn.exec_driver_sql(
                "DELETE FROM sites WHERE id = %(sid)s",
                {"sid": site_id},
            )

        # Confirm cleanup
        ev_rem = session.scalar(select(func.count()).select_from(EnergyWastageEvent).where(EnergyWastageEvent.machine_id == machine_id)) or 0
        tel_rem = session.scalar(select(func.count()).select_from(Telemetry).where(Telemetry.machine_id == machine_id)) or 0
        m_rem = session.scalar(select(func.count()).select_from(Machine).where(Machine.id == machine_id)) or 0
        s_rem = session.scalar(select(func.count()).select_from(Site).where(Site.id == site_id)) or 0
        cleanup_clean = (ev_rem == 0 and tel_rem == 0 and m_rem == 0 and s_rem == 0)

        if cleanup_clean:
            print("  [PASS] All temporary records successfully cleaned up (0 rows remaining).")
        else:
            print(f"  [FAIL] Residual rows detected: ev={ev_rem}, tel={tel_rem}, m={m_rem}, s={s_rem}")
            all_passed = False

        session.close()
        engine.dispose()

    print("\n" + "=" * 80)
    if all_passed:
        print("STAGE 4A END-TO-END VALIDATION PASSED SUCCESSFULLY.")
        print("=" * 80)
        return 0
    else:
        print("STAGE 4A VALIDATION FAILED.")
        print("=" * 80)
        return 1


if __name__ == "__main__":
    sys.exit(main())
