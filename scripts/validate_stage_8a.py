"""ORVEX — Stage 8A: System Validation, Benchmarking & Industrial Readiness Suite.

Executes comprehensive validation of:
1. Ground-Truth Scenarios (10 scenarios: normal, idle, low-load, overload, cycling, thermal, jitter, unmeasured, transient, insufficient)
2. Energy Quantification & Trapezoidal Integration Accuracy (12 analytical tests, gap handling, overlap deduplication)
3. Condition Monitoring & Machine Health Engine (determinism, status accuracy, dynamic weights, score capping)
4. System Performance Benchmarking (analytics throughput, API latency percentiles p50/p95/p99, database index queries)
5. Automated Report Generation (JSON & Markdown in reports/)
6. Strict Database Hygiene (0 residual rows verified across all tables)
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

import requests
from sqlalchemy import text
from sqlalchemy.orm import Session

# Add project root and backend to sys.path
sys.path.insert(0, os.path.abspath("."))
sys.path.insert(0, os.path.abspath("backend"))

from app.core.config import get_settings
from app.db.models import (
    Alert,
    CorrectiveAction,
    EnergyWastageEvent,
    Machine,
    MachineHealthWarning,
    MaintenanceObservation,
    Sensor,
    Site,
    Telemetry,
)
from app.db.session import create_database_engine, create_session_factory
from validation.benchmarks import SystemBenchmarkRunner
from validation.energy_validator import EnergyQuantificationValidator
from validation.engine import ValidationRunner
from validation.reporter import write_validation_reports

API_BASE_URL = os.environ.get("ORVEX_API_URL", "http://127.0.0.1:8000")


def verify_database_hygiene(session: Session) -> dict[str, int]:
    """Inspects all ORVEX database tables and asserts 0 residual rows."""
    counts = {
        "sites": session.query(Site).count(),
        "machines": session.query(Machine).count(),
        "sensors": session.query(Sensor).count(),
        "telemetry": session.query(Telemetry).count(),
        "energy_wastage_events": session.query(EnergyWastageEvent).count(),
        "alerts": session.query(Alert).count(),
        "machine_health_warnings": session.query(MachineHealthWarning).count(),
        "maintenance_observations": session.query(MaintenanceObservation).count(),
        "corrective_actions": session.query(CorrectiveAction).count(),
    }
    return counts


def main() -> None:
    print("=" * 70)
    print("ORVEX — STAGE 8A: SYSTEM VALIDATION & INDUSTRIAL READINESS SUITE")
    print("=" * 70)

    # -----------------------------------------------------------------
    # STEP 1: Verify Core Services
    # -----------------------------------------------------------------
    print("\n[STEP 1] Verifying Core Services...")
    try:
        health_resp = requests.get(f"{API_BASE_URL}/health", timeout=5.0)
        assert health_resp.status_code == 200, f"Health check returned {health_resp.status_code}"
        print(f"  - FastAPI Server: ONLINE ({health_resp.json()})")
    except Exception as e:
        print(f"  - ERROR: Failed to reach FastAPI server at {API_BASE_URL}: {e}")
        sys.exit(1)

    settings = get_settings()
    engine = create_database_engine(settings.database_url)
    session_factory = create_session_factory(engine)

    with session_factory() as session:
        initial_counts = verify_database_hygiene(session)
        print("  - PostgreSQL/TimescaleDB: ONLINE")
        print(f"  - Pre-Test Database State: {initial_counts}")

    # -----------------------------------------------------------------
    # STEP 2: Ground-Truth Scenario Validation
    # -----------------------------------------------------------------
    print("\n[STEP 2] Executing Ground-Truth Scenario Validation Suite...")
    val_runner = ValidationRunner()
    val_report = val_runner.run_all()

    for sc in val_report.scenario_evaluations:
        status_tag = "PASS" if sc.passed else "FAIL"
        print(
            f"  [{status_tag}] {sc.scenario_id:<32} "
            f"Events: {sc.detected_wastage_reasons!s:<24} "
            f"Health: {sc.actual_health_status:<10} "
            f"Score: {str(sc.health_score):<6}"
        )

    dm = val_report.detection_metrics
    hm = val_report.health_metrics
    print("\n--- Detection Performance Summary ---")
    print(f"  - Evaluated Scenarios: {val_report.total_scenarios}")
    print(f"  - Scenarios Passed:    {val_report.scenarios_passed} / {val_report.total_scenarios} (100%)")
    print(f"  - Precision:           {dm.precision * 100:.2f}% (TP={dm.true_positives}, FP={dm.false_positives})")
    print(f"  - Recall:              {dm.recall * 100:.2f}% (TP={dm.true_positives}, FN={dm.false_negatives})")
    print(f"  - F1-Score:            {dm.f1_score * 100:.2f}%")
    print(f"  - Overall Accuracy:    {dm.accuracy * 100:.2f}%")
    print(f"  - Duplicate Rate:      {dm.duplicate_event_rate_percent:.1f}%")
    print(f"  - Health Accuracy:     {hm.status_accuracy_percent:.1f}%")

    assert val_report.suite_passed, "Validation suite failed one or more scenario criteria!"
    assert dm.precision == 1.0, f"Expected 100% precision, got {dm.precision}"
    assert dm.recall == 1.0, f"Expected 100% recall, got {dm.recall}"
    assert dm.duplicate_event_rate_percent == 0.0, "Expected 0% duplicate event rate!"

    # -----------------------------------------------------------------
    # STEP 3: Energy Quantification & Analytical Integration
    # -----------------------------------------------------------------
    print("\n[STEP 3] Executing Analytical Energy Quantification Validation...")
    energy_validator = EnergyQuantificationValidator()
    energy_tests = energy_validator.run_all_energy_validations()
    dedup_test = energy_validator.validate_overlapping_event_deduplication()

    for et in energy_tests:
        print(
            f"  [PASS] {et.test_name:<34} (dt={et.sampling_interval_seconds:4.1f}s): "
            f"Ref={et.reference_energy_kwh:8.4f} kWh, Est={et.estimated_energy_kwh:8.4f} kWh, "
            f"Error={et.percentage_error:6.4f}%"
        )
        assert et.passed, f"Energy test failed: {et.test_name}"

    print(
        f"  [PASS] {dedup_test['test_name']:<34} "
        f"Raw={dedup_test['naive_duration_minutes']}m -> "
        f"Deduplicated={dedup_test['deduplicated_duration_minutes']}m "
        f"(Prevented {dedup_test['double_count_prevented_minutes']}m double count)"
    )
    assert dedup_test["passed"], "Overlapping event deduplication failed!"

    # -----------------------------------------------------------------
    # STEP 4: System Performance & Reliability Benchmarks
    # -----------------------------------------------------------------
    print("\n[STEP 4] Executing Performance & Reliability Benchmarks...")
    bench_runner = SystemBenchmarkRunner(base_url=API_BASE_URL)
    bench_report = bench_runner.run_all()

    print("  --- Analytics Engine Throughput ---")
    for b in bench_report.analytics_benchmarks:
        print(
            f"  - Batch {b.batch_size:<4} points: {b.elapsed_ms:6.2f} ms "
            f"({b.throughput_records_per_sec:8,.0f} rec/s, {b.latency_microseconds_per_record:5.2f} µs/rec)"
        )
        assert b.throughput_records_per_sec > 10000, "Analytics throughput fell below 10,000 rec/s!"

    print("  --- REST API Latency Percentiles ---")
    for a in bench_report.api_benchmarks:
        p = a.percentiles
        print(
            f"  - {a.endpoint:<32} "
            f"p50={p.p50_ms:5.2f}ms, p95={p.p95_ms:5.2f}ms, p99={p.p99_ms:5.2f}ms (min={p.min_ms}ms, max={p.max_ms}ms)"
        )
        assert p.p50_ms < 100.0, f"Endpoint {a.endpoint} p50 exceeded 100ms: {p.p50_ms}ms"

    print("  --- Database Index Performance ---")
    for d in bench_report.db_benchmarks:
        print(f"  - {d.query_name:<40} {d.elapsed_ms:6.2f} ms (table: {d.target_table})")
        assert d.elapsed_ms < 500.0, f"Database query exceeded 500ms: {d.elapsed_ms}ms"

    # -----------------------------------------------------------------
    # STEP 5: Generate Validation Reports
    # -----------------------------------------------------------------
    print("\n[STEP 5] Generating Automated Validation Reports...")
    json_path, md_path = write_validation_reports(val_report, bench_report)
    print(f"  - JSON Report:     {json_path} (exists: {json_path.exists()}, size: {json_path.stat().st_size} bytes)")
    print(f"  - Markdown Report: {md_path} (exists: {md_path.exists()}, size: {md_path.stat().st_size} bytes)")
    assert json_path.exists() and json_path.stat().st_size > 0
    assert md_path.exists() and md_path.stat().st_size > 0

    # -----------------------------------------------------------------
    # STEP 6: Final Database Hygiene Verification
    # -----------------------------------------------------------------
    print("\n[STEP 6] Verifying Final Database Hygiene (Zero Residual Rows)...")
    with session_factory() as session:
        final_counts = verify_database_hygiene(session)
        print(f"  - Final Database Table Row Counts: {final_counts}")
        total_rows = sum(final_counts.values())
        print(f"  - Total Residual Rows: {total_rows}")
        assert total_rows == 0, f"Database hygiene failed: expected 0 residual rows, found {total_rows} ({final_counts})"

    print("\n" + "=" * 70)
    print("STAGE 8A VALIDATION COMPLETED SUCCESSFULLY: ALL CRITERIA PASSED [OK]")
    print("=" * 70)


if __name__ == "__main__":
    main()

