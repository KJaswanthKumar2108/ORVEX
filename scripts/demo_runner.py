"""ORVEX Repeatable Demonstration and Scenario Validation CLI.

Provides safe, reproducible workflow for technical demonstrations:
1. Check environment and service health (--status)
2. Provision demo mining fleet (--provision)
3. Run scenarios independently or all at once (--scenario <name> / --run-all)
4. Safe reset of demo data (--reset-demo-data --confirm)
"""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import os
import sys
import time
from typing import Any
from uuid import UUID

import requests
from sqlalchemy import func, select
from sqlalchemy.orm import Session

# Add project root and backend to sys.path
sys.path.insert(0, os.path.abspath("."))
sys.path.insert(0, os.path.abspath("backend"))

from analytics.config import DetectionConfig
from app.core.config import get_settings
from app.db.models import Alert, EnergyWastageEvent, Machine, Site, Telemetry
from app.db.session import create_database_engine, create_session_factory
from app.repositories.wastage_event_repository import WastageEventRepository
from app.services.analytics_orchestrator import AnalyticsOrchestrator
from app.services.wastage_event_service import WastageEventService
from simulator.generator import TelemetryGenerator
from simulator.models import Scenario
from simulator.mqtt_client import TelemetryMqttClient
from simulator.profiles import DEFAULT_PROFILE
from simulator.scenarios import ScenarioController

# Deterministic demo IDs
DEMO_SITE_ID = UUID("00000000-0000-0000-de30-000000000001")
DEMO_SITE_NAME = "ORVEX Demo Mining Pit"

DEMO_FLEET: dict[str, dict[str, Any]] = {
    "DEMO-CONV-01": {
        "id": UUID("00000000-0000-0000-de30-000000000011"),
        "name": "Primary Overland Conveyor",
        "type": "conveyor",
        "rated_power_kw": Decimal("132.0"),
        "default_scenario": "idle_wastage",
    },
    "DEMO-PUMP-02": {
        "id": UUID("00000000-0000-0000-de30-000000000022"),
        "name": "Slurry Transfer Pump",
        "type": "pump",
        "rated_power_kw": Decimal("75.0"),
        "default_scenario": "start_stop_cycling",
    },
    "DEMO-CRUSH-03": {
        "id": UUID("00000000-0000-0000-de30-000000000033"),
        "name": "Primary Jaw Crusher",
        "type": "crusher",
        "rated_power_kw": Decimal("160.0"),
        "default_scenario": "low_load_wastage",
    },
    "DEMO-FAN-04": {
        "id": UUID("00000000-0000-0000-de30-000000000044"),
        "name": "Shaft Ventilation Fan 4",
        "type": "fan",
        "rated_power_kw": Decimal("55.0"),
        "default_scenario": "normal",
    },
    "DEMO-HOIST-05": {
        "id": UUID("00000000-0000-0000-de30-000000000055"),
        "name": "Mine Production Hoist",
        "type": "hoist",
        "rated_power_kw": Decimal("200.0"),
        "default_scenario": "abnormal_power",
    },
}

SCENARIO_NAME_MAP: dict[str, Scenario] = {
    "normal": Scenario.NORMAL_OPERATION,
    "idle_wastage": Scenario.IDLE_WASTAGE,
    "idle": Scenario.IDLE_WASTAGE,
    "low_load_wastage": Scenario.LOW_LOAD_WASTAGE,
    "low_load": Scenario.LOW_LOAD_WASTAGE,
    "abnormal_power": Scenario.ABNORMAL_POWER,
    "abnormal": Scenario.ABNORMAL_POWER,
    "start_stop_cycling": Scenario.START_STOP_CYCLING,
    "cycling": Scenario.START_STOP_CYCLING,
}

# Isolated test detection config with shortened thresholds for fast demo execution
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


def get_db_session() -> tuple[Any, Session]:
    settings = get_settings()
    engine = create_database_engine(settings.database_url)
    session_factory = create_session_factory(engine)
    return engine, session_factory()


def check_status(api_url: str) -> None:
    print("\n" + "=" * 70)
    print("ORVEX SYSTEM STATUS & DEMO HEALTH AUDIT")
    print("=" * 70)

    # 1. API Health
    print(f"Checking API service at {api_url}/health...")
    try:
        resp = requests.get(f"{api_url}/health?details=true", timeout=3.0)
        if resp.status_code == 200 and resp.json().get("status") == "ok":
            print(f"  [PASS] API Health: ONLINE (HTTP {resp.status_code})")
            gateway_info = resp.json().get("mqtt_gateway")
            if gateway_info:
                gw_status = "CONNECTED" if gateway_info.get("connected") else "DISCONNECTED"
                print(f"  [PASS] MQTT Gateway: {gw_status} (broker: {gateway_info.get('broker')}, prefix: '{gateway_info.get('topic_prefix')}')")
                print(f"         Gateway Stats: received={gateway_info.get('messages_received')}, ingested={gateway_info.get('messages_ingested')}, rejected={gateway_info.get('messages_rejected')}")
        else:
            print(f"  [WARN] API Health: Returned HTTP {resp.status_code}: {resp.text}")
    except Exception as exc:
        print(f"  [FAIL] API Health: OFFLINE ({exc})")

    # 2. Database Health
    engine, session = get_db_session()
    try:
        total_machines = session.scalar(select(func.count()).select_from(Machine)) or 0
        total_telemetry = session.scalar(select(func.count()).select_from(Telemetry)) or 0
        total_events = session.scalar(select(func.count()).select_from(EnergyWastageEvent)) or 0
        total_alerts = session.scalar(select(func.count()).select_from(Alert)) or 0

        demo_machines = session.scalar(
            select(func.count()).select_from(Machine).where(Machine.machine_identifier.like("DEMO-%"))
        ) or 0
        demo_events = session.scalar(
            select(func.count())
            .select_from(EnergyWastageEvent)
            .join(Machine, EnergyWastageEvent.machine_id == Machine.id)
            .where(Machine.machine_identifier.like("DEMO-%"))
        ) or 0
        demo_alerts = session.scalar(
            select(func.count())
            .select_from(Alert)
            .join(Machine, Alert.machine_id == Machine.id)
            .where(Machine.machine_identifier.like("DEMO-%"))
        ) or 0

        print(f"  [PASS] TimescaleDB: CONNECTED")
        print(f"         Total in database: {total_machines} machines, {total_telemetry} telemetry rows, {total_events} events, {total_alerts} alerts")
        print(f"         Demo data: {demo_machines} demo machines, {demo_events} demo events, {demo_alerts} demo alerts")
    except Exception as exc:
        print(f"  [FAIL] TimescaleDB: Connection error ({exc})")
    finally:
        session.close()
        engine.dispose()
    print("=" * 70 + "\n")


def provision_demo_fleet() -> None:
    print("\n" + "=" * 70)
    print("PROVISIONING ORVEX DEMO MINING FLEET")
    print("=" * 70)

    engine, session = get_db_session()
    try:
        # 1. Ensure Demo Site exists
        site = session.get(Site, DEMO_SITE_ID)
        if site is None:
            site = Site(
                id=DEMO_SITE_ID,
                name=DEMO_SITE_NAME,
                location="Pilbara Region, Western Australia",
                timezone="Australia/Perth",
            )
            session.add(site)
            session.flush()
            print(f"  [CREATED] Site: {site.name} ({site.id})")
        else:
            print(f"  [EXISTS]  Site: {site.name}")

        # 2. Ensure Demo Machines exist
        for identifier, spec in DEMO_FLEET.items():
            machine = session.get(Machine, spec["id"])
            if machine is None:
                machine = Machine(
                    id=spec["id"],
                    site_id=DEMO_SITE_ID,
                    machine_identifier=identifier,
                    name=spec["name"],
                    machine_type=spec["type"],
                    rated_power_kw=spec["rated_power_kw"],
                    status="active",
                )
                session.add(machine)
                print(f"  [CREATED] Machine: {identifier} - {spec['name']} ({spec['rated_power_kw']} kW)")
            else:
                print(f"  [EXISTS]  Machine: {identifier} - {machine.name}")

        session.commit()
        print("\nDemo fleet provisioned successfully. Ready for scenario execution.")
    finally:
        session.close()
        engine.dispose()
    print("=" * 70 + "\n")


def run_scenario(
    scenario_key: str,
    api_url: str,
    fast: bool = True,
    sample_count: int | None = None,
    transport: str = "http",
    mqtt_host: str = "localhost",
    mqtt_port: int = 1883,
    mqtt_topic_prefix: str = "orvex",
) -> dict[str, Any]:
    if scenario_key not in SCENARIO_NAME_MAP:
        raise ValueError(f"Unknown scenario '{scenario_key}'. Choose from: {list(SCENARIO_NAME_MAP.keys())}")

    scenario_enum = SCENARIO_NAME_MAP[scenario_key]

    # Find target machine
    target_machine_id = None
    target_identifier = None
    for identifier, spec in DEMO_FLEET.items():
        if spec["default_scenario"] == scenario_key:
            target_machine_id = spec["id"]
            target_identifier = identifier
            break

    if target_machine_id is None:
        target_machine_id = list(DEMO_FLEET.values())[0]["id"]
        target_identifier = list(DEMO_FLEET.keys())[0]

    if sample_count is not None:
        num_samples = sample_count
    elif scenario_enum is Scenario.START_STOP_CYCLING:
        num_samples = 60 if fast else 200
    elif scenario_enum is Scenario.LOW_LOAD_WASTAGE:
        num_samples = 25 if fast else 140
    else:
        num_samples = 25 if fast else 75

    print(f"\n--- Running Scenario: {scenario_key.upper()} on {target_identifier} ---")
    print(f"Target Machine ID: {target_machine_id}")
    print(f"Mode: {'FAST (isolated thresholds)' if fast else 'STANDARD (full duration)'}")
    print(f"Transport: {transport.upper()} ({f'{mqtt_host}:{mqtt_port} prefix={mqtt_topic_prefix}' if transport == 'mqtt' else api_url})")
    print(f"Submitting {num_samples} telemetry samples...")

    from dataclasses import replace
    target_spec = DEMO_FLEET.get(target_identifier, {})
    rated_kw = float(target_spec.get("rated_power_kw", Decimal("132.0")))
    profile = replace(
        DEFAULT_PROFILE,
        rated_power_kw=rated_kw,
        idle_power_kw=DEFAULT_PROFILE.idle_power_kw * (rated_kw / DEFAULT_PROFILE.rated_power_kw),
    )
    controller = ScenarioController(scenario_enum, profile)
    generator = TelemetryGenerator(machine_id=target_machine_id, profile=profile, interval_seconds=1.0)
    start_time = datetime.now(timezone.utc) - timedelta(seconds=num_samples + 5)

    submitted = 0
    persisted = 0

    mqtt_client: TelemetryMqttClient | None = None
    if transport == "mqtt":
        mqtt_client = TelemetryMqttClient(
            host=mqtt_host,
            port=mqtt_port,
            topic_prefix=mqtt_topic_prefix,
        )

    try:
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

            if transport == "mqtt" and mqtt_client is not None:
                try:
                    mqtt_client.send_payload(target_machine_id, payload)
                    submitted += 1
                    persisted += 1
                except Exception as exc:
                    print(f"  [ERROR] MQTT Sample {s} publish failed: {exc}")
            else:
                try:
                    resp = requests.post(f"{api_url}/api/v1/telemetry", json=payload, timeout=3.0)
                    submitted += 1
                    if resp.status_code == 201:
                        persisted += 1
                except Exception as exc:
                    print(f"  [ERROR] Sample {s} submission failed: {exc}")

        # Concluding stopped sample to finalize ongoing condition
        stop_rec = generator.generate(step.state, timestamp=start_time + timedelta(seconds=num_samples))
        stop_payload = stop_rec.to_payload()
        stop_payload["operating_state"] = "stopped"
        stop_payload["active_power"] = 0.0

        if transport == "mqtt" and mqtt_client is not None:
            try:
                mqtt_client.send_payload(target_machine_id, stop_payload)
                submitted += 1
                persisted += 1
            except Exception:
                pass
        else:
            try:
                requests.post(f"{api_url}/api/v1/telemetry", json=stop_payload, timeout=3.0)
                submitted += 1
                persisted += 1
            except Exception:
                pass
    finally:
        if mqtt_client is not None:
            time.sleep(0.5)
            mqtt_client.close()

    if fast:
        engine, session = get_db_session()
        try:
            w_service = WastageEventService(WastageEventRepository(session))
            orchestrator = AnalyticsOrchestrator(
                session=session,
                persistence_service=w_service,
                config=FAST_DETECTION_CONFIG,
            )
            orchestrator.process_machine(target_machine_id, finalize_ongoing=True)
            session.commit()
        finally:
            session.close()
            engine.dispose()

    # Query results from read APIs
    time.sleep(0.5)
    t_start = (start_time - timedelta(seconds=5)).strftime("%Y-%m-%dT%H:%M:%SZ")
    t_end = (start_time + timedelta(seconds=num_samples + 10)).strftime("%Y-%m-%dT%H:%M:%SZ")

    # 1. Summary
    sum_resp = requests.get(f"{api_url}/api/v1/machines/{target_machine_id}/summary", timeout=3.0).json()
    # 2. Energy Summary
    energy_resp = requests.get(
        f"{api_url}/api/v1/machines/{target_machine_id}/energy-summary?start_time={t_start}&end_time={t_end}",
        timeout=3.0,
    ).json()
    # 3. Wastage Events
    events_resp = requests.get(
        f"{api_url}/api/v1/machines/{target_machine_id}/wastage-events?start_time={t_start}&end_time={t_end}",
        timeout=3.0,
    ).json()

    events_items = events_resp.get("items", [])
    event_reasons = [e["detection_reason"] for e in events_items]
    wasted_kwh_list = [e["estimated_wasted_energy_kwh"] for e in events_items]

    # 4. In-App Alerts (Stage 5A)
    alerts_resp = requests.get(
        f"{api_url}/api/v1/machines/{target_machine_id}/alerts?start_time={t_start}&end_time={t_end}",
        timeout=3.0,
    ).json()
    alerts_items = alerts_resp.get("items", [])
    alert_titles = [a["title"] for a in alerts_items]
    alert_severities = [a["severity"] for a in alerts_items]

    result = {
        "scenario": scenario_key,
        "machine_id": str(target_machine_id),
        "identifier": target_identifier,
        "samples_submitted": submitted,
        "samples_persisted": persisted,
        "event_count": len(events_items),
        "alert_count": len(alerts_items),
        "reasons": event_reasons,
        "alert_titles": alert_titles,
        "alert_severities": alert_severities,
        "wasted_energy_values": wasted_kwh_list,
        "summary_actual_kwh": energy_resp.get("actual_energy_kwh"),
        "summary_wasted_kwh": energy_resp.get("estimated_wasted_energy_kwh"),
        "telemetry_freshness": sum_resp.get("telemetry_freshness"),
        "latest_state": sum_resp.get("latest_operating_state"),
    }

    print(f"  [RESULT] Samples: {persisted}/{submitted} | Events: {len(events_items)} | Alerts: {len(alerts_items)}")
    if event_reasons:
        print(f"           Reasons: {', '.join(event_reasons)}")
        for i, val in enumerate(wasted_kwh_list):
            val_str = f"{val:.4f} kWh (est.)" if val is not None else "Not estimated (cycling null preserved)"
            print(f"           Event {i+1} Wasted Energy: {val_str}")
        if alerts_items:
            for j, al in enumerate(alerts_items):
                print(f"           Alert {j+1}: [{al['severity'].upper()}] {al['title']} (Status: {al['status']})")
    else:
        print("           No wastage events (Clean operation confirmed)")

    return result


def reset_demo_data(confirmed: bool) -> bool:
    print("\n" + "=" * 70)
    print("ORVEX DEMO DATA RESET — SAFETY GUARD")
    print("=" * 70)

    engine, session = get_db_session()
    try:
        # Audit target demo records before action
        demo_machine_ids = list(DEMO_FLEET.values())
        m_ids = [m["id"] for m in demo_machine_ids]

        ev_count = session.scalar(
            select(func.count()).select_from(EnergyWastageEvent).where(EnergyWastageEvent.machine_id.in_(m_ids))
        ) or 0
        al_count = session.scalar(
            select(func.count()).select_from(Alert).where(Alert.machine_id.in_(m_ids))
        ) or 0
        tel_count = session.scalar(
            select(func.count()).select_from(Telemetry).where(Telemetry.machine_id.in_(m_ids))
        ) or 0
        m_count = session.scalar(
            select(func.count()).select_from(Machine).where(Machine.id.in_(m_ids))
        ) or 0
        s_count = session.scalar(
            select(func.count()).select_from(Site).where(Site.id == DEMO_SITE_ID)
        ) or 0

        print(f"Target Demo Fleet Records:")
        print(f"  - In-App Alerts:  {al_count} rows")
        print(f"  - Wastage Events: {ev_count} rows")
        print(f"  - Telemetry:      {tel_count} rows")
        print(f"  - Machines:       {m_count} rows (Identifiers: {', '.join(DEMO_FLEET.keys())})")
        print(f"  - Demo Site:      {s_count} row (Site: {DEMO_SITE_NAME})")

        if not confirmed:
            print("\n[SAFETY GUARD TRIGGERED]")
            print("Deletion was NOT executed because the '--confirm' flag was not specified.")
            print("To safely clean up only the demo records, re-run with:")
            print("  python scripts/demo_runner.py --reset-demo-data --confirm")
            print("=" * 70 + "\n")
            return False

        # Execute safe isolated deletion of demo rows only
        print("\nExecuting isolated deletion of DEMO records only...")
        with session.get_bind().begin() as conn:
            conn.exec_driver_sql(
                "DELETE FROM alerts WHERE machine_id = ANY(%(mids)s)",
                {"mids": m_ids},
            )
            conn.exec_driver_sql(
                "DELETE FROM energy_wastage_events WHERE machine_id = ANY(%(mids)s)",
                {"mids": m_ids},
            )
            conn.exec_driver_sql(
                "DELETE FROM telemetry WHERE machine_id = ANY(%(mids)s)",
                {"mids": m_ids},
            )
            conn.exec_driver_sql(
                "DELETE FROM machines WHERE id = ANY(%(mids)s)",
                {"mids": m_ids},
            )
            conn.exec_driver_sql(
                "DELETE FROM sites WHERE id = %(sid)s",
                {"sid": DEMO_SITE_ID},
            )

        print("  [SUCCESS] All demo records safely removed.")
        print("  [PRESERVED] Non-demo data, database schema, and tables remain 100% untouched.")
        return True
    finally:
        session.close()
        engine.dispose()
        print("=" * 70 + "\n")


def run_all(
    api_url: str,
    fast: bool = True,
    transport: str = "http",
    mqtt_host: str = "localhost",
    mqtt_port: int = 1883,
    mqtt_topic_prefix: str = "orvex",
) -> int:
    print("\n" + "=" * 80)
    print("ORVEX END-TO-END DEMONSTRATION & 5-SCENARIO VALIDATION SUITE")
    print(f"Transport: {transport.upper()}")
    print("=" * 80)

    # 1. Provision
    provision_demo_fleet()

    # 2. Run all 5 scenarios
    scenarios = ["normal", "idle_wastage", "low_load_wastage", "abnormal_power", "start_stop_cycling"]
    results = []

    for sc in scenarios:
        res = run_scenario(
            sc,
            api_url=api_url,
            fast=fast,
            transport=transport,
            mqtt_host=mqtt_host,
            mqtt_port=mqtt_port,
            mqtt_topic_prefix=mqtt_topic_prefix,
        )
        results.append(res)

    # 3. Print markdown summary table
    print("\n" + "=" * 80)
    print("SUMMARY RESULTS ACROSS ALL 5 SCENARIOS:")
    print("=" * 80)
    print(f"{'Scenario':<20} | {'Machine':<14} | {'Samples':<10} | {'Events':<6} | {'Alerts':<6} | {'Reason(s)':<22} | {'Wasted kWh'}")
    print("-" * 98)
    for r in results:
        wasted_str = "None"
        if r["wasted_energy_values"]:
            val = r["wasted_energy_values"][0]
            wasted_str = f"{val:.4f} kWh" if val is not None else "Not estimated (null)"
        reason_str = r["reasons"][0] if r["reasons"] else "None (Clean)"
        print(f"{r['scenario']:<20} | {r['identifier']:<14} | {r['samples_persisted']}/{r['samples_submitted']:<8} | {r['event_count']:<6} | {r['alert_count']:<6} | {reason_str:<22} | {wasted_str}")

    print("=" * 98)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="ORVEX Demonstration & Scenario Runner")
    parser.add_argument("--status", action="store_true", help="Check system and demo status")
    parser.add_argument("--provision", action="store_true", help="Provision demo mining fleet")
    parser.add_argument("--scenario", type=str, help="Run single scenario (normal, idle_wastage, low_load_wastage, abnormal_power, start_stop_cycling)")
    parser.add_argument("--run-all", action="store_true", help="Run all 5 scenarios end-to-end")
    parser.add_argument("--reset-demo-data", action="store_true", help="Reset and remove demo records safely")
    parser.add_argument("--confirm", action="store_true", help="Confirmation flag required for --reset-demo-data")
    parser.add_argument("--api-url", type=str, default="http://127.0.0.1:8000", help="FastAPI backend URL (default: http://127.0.0.1:8000)")
    parser.add_argument("--fast", action="store_true", default=True, help="Use shortened sample count (default: True)")
    parser.add_argument("--transport", choices=["http", "mqtt"], default="http", help="Telemetry ingestion transport (default: http)")
    parser.add_argument("--mqtt-host", type=str, default="localhost", help="MQTT broker host (default: localhost)")
    parser.add_argument("--mqtt-port", type=int, default=1883, help="MQTT broker port (default: 1883)")
    parser.add_argument("--mqtt-topic-prefix", type=str, default="orvex", help="MQTT topic prefix (default: orvex)")

    args = parser.parse_args()

    if args.status:
        check_status(args.api_url)
        return 0

    if args.provision:
        provision_demo_fleet()
        return 0

    if args.scenario:
        provision_demo_fleet()
        run_scenario(
            args.scenario,
            api_url=args.api_url,
            fast=args.fast,
            transport=args.transport,
            mqtt_host=args.mqtt_host,
            mqtt_port=args.mqtt_port,
            mqtt_topic_prefix=args.mqtt_topic_prefix,
        )
        return 0

    if args.run_all:
        return run_all(
            args.api_url,
            fast=args.fast,
            transport=args.transport,
            mqtt_host=args.mqtt_host,
            mqtt_port=args.mqtt_port,
            mqtt_topic_prefix=args.mqtt_topic_prefix,
        )

    if args.reset_demo_data:
        success = reset_demo_data(args.confirm)
        return 0 if success else 1

    parser.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
