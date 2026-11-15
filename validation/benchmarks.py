"""Performance & Reliability Benchmarks for ORVEX.

Measures:
1. Analytics processing latency & throughput (100, 500, 1000, 5000 points)
2. API endpoint response latency percentiles (p50, p95, p99 ms)
3. Database index query latency on TimescaleDB/PostgreSQL
"""

from __future__ import annotations

import sys
import time
import urllib.request
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

_backend_dir = str(Path(__file__).resolve().parent.parent / "backend")
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from analytics.config import PiecewisePowerBaseline
from analytics.detectors.detector import DetectionEngine
from analytics.models import TelemetryInput
from analytics.services.feature_engine import FeatureEngine
from app.core.config import get_settings
from app.db.models import Machine, MachineHealthWarning, Telemetry
from app.db.session import create_database_engine, create_session_factory
from sqlalchemy import text


@dataclass
class LatencyPercentiles:
    min_ms: float
    p50_ms: float
    p95_ms: float
    p99_ms: float
    max_ms: float
    mean_ms: float
    sample_count: int


@dataclass
class EndpointBenchmarkResult:
    endpoint: str
    method: str
    status_code: int
    percentiles: LatencyPercentiles


@dataclass
class AnalyticsBatchBenchmarkResult:
    batch_size: int
    elapsed_ms: float
    throughput_records_per_sec: float
    latency_microseconds_per_record: float


@dataclass
class DatabaseBenchmarkResult:
    query_name: str
    target_table: str
    indexed_columns: str
    elapsed_ms: float
    rows_returned: int


@dataclass
class BenchmarkSuiteReport:
    timestamp: str
    analytics_benchmarks: list[AnalyticsBatchBenchmarkResult] = field(default_factory=list)
    api_benchmarks: list[EndpointBenchmarkResult] = field(default_factory=list)
    db_benchmarks: list[DatabaseBenchmarkResult] = field(default_factory=list)


class SystemBenchmarkRunner:
    def __init__(self, base_url: str = "http://127.0.0.1:8000") -> None:
        self.base_url = base_url.rstrip("/")

    def benchmark_analytics_pipeline(
        self, batch_sizes: list[int] | None = None
    ) -> list[AnalyticsBatchBenchmarkResult]:
        """Measures FeatureEngine + DetectionEngine throughput across increasing batch sizes."""
        if batch_sizes is None:
            batch_sizes = [100, 500, 1000, 5000]

        results: list[AnalyticsBatchBenchmarkResult] = []
        fe = FeatureEngine(baseline=PiecewisePowerBaseline(rated_power_kw=132.0))
        de = DetectionEngine()
        m_id = uuid4()
        t0 = datetime(2026, 11, 4, 8, 0, 0, tzinfo=timezone.utc)

        for n in batch_sizes:
            inputs = [
                TelemetryInput(
                    timestamp=t0 + timedelta(seconds=i * 15),
                    machine_id=m_id,
                    active_power=88.0 + ((i % 5) - 2) * 1.5,
                    voltage=415.0,
                    current=130.0,
                    apparent_power=92.0,
                    power_factor=0.91,
                    cumulative_energy=100.0 + (i * 0.36),
                    rpm=1480.0,
                    temperature=65.0,
                    load_percent=66.0,
                    operating_state="OPTIMAL",
                )
                for i in range(n)
            ]

            # Warm up
            _ = [fe.process(inp) for inp in inputs[:10]]

            # Timed run
            start_time = time.perf_counter()
            feats = [fe.process(inp) for inp in inputs]
            _ = de.process(feats)
            elapsed_sec = time.perf_counter() - start_time

            elapsed_ms = elapsed_sec * 1000.0
            throughput = n / elapsed_sec if elapsed_sec > 0 else 0.0
            us_per_record = (elapsed_ms / n) * 1000.0

            results.append(
                AnalyticsBatchBenchmarkResult(
                    batch_size=n,
                    elapsed_ms=round(elapsed_ms, 2),
                    throughput_records_per_sec=round(throughput, 1),
                    latency_microseconds_per_record=round(us_per_record, 2),
                )
            )

        return results

    def benchmark_api_endpoints(
        self, endpoints: list[str] | None = None, requests_per_endpoint: int = 50
    ) -> list[EndpointBenchmarkResult]:
        """Measures latency percentiles across key REST API endpoints."""
        if endpoints is None:
            endpoints = [
                "/health",
                "/api/v1/machines",
                "/api/v1/alerts",
                "/api/v1/insights/summary",
                "/api/v1/machine-health/summary",
                "/api/v1/machine-health/warnings",
            ]

        results: list[EndpointBenchmarkResult] = []

        for ep in endpoints:
            url = f"{self.base_url}{ep}"
            latencies_ms: list[float] = []
            status_code = 200

            # Warm-up call
            try:
                with urllib.request.urlopen(url, timeout=5) as r:
                    _ = r.read()
            except Exception:
                pass

            for _ in range(requests_per_endpoint):
                t0 = time.perf_counter()
                try:
                    with urllib.request.urlopen(url, timeout=5) as resp:
                        status_code = resp.status
                        _ = resp.read()
                    latencies_ms.append((time.perf_counter() - t0) * 1000.0)
                except Exception:
                    pass

            if latencies_ms:
                latencies_ms.sort()
                n = len(latencies_ms)
                p50 = latencies_ms[int(n * 0.50)]
                p95 = latencies_ms[min(int(n * 0.95), n - 1)]
                p99 = latencies_ms[min(int(n * 0.99), n - 1)]
                mean_lat = sum(latencies_ms) / n

                percentiles = LatencyPercentiles(
                    min_ms=round(latencies_ms[0], 2),
                    p50_ms=round(p50, 2),
                    p95_ms=round(p95, 2),
                    p99_ms=round(p99, 2),
                    max_ms=round(latencies_ms[-1], 2),
                    mean_ms=round(mean_lat, 2),
                    sample_count=n,
                )
                results.append(
                    EndpointBenchmarkResult(
                        endpoint=ep,
                        method="GET",
                        status_code=status_code,
                        percentiles=percentiles,
                    )
                )

        return results

    def benchmark_database_performance(self) -> list[DatabaseBenchmarkResult]:
        """Measures index query execution times directly against PostgreSQL."""
        results: list[DatabaseBenchmarkResult] = []
        settings = get_settings()
        engine = create_database_engine(settings.database_url)
        factory = create_session_factory(engine)

        queries = [
            (
                "Indexed Telemetry Timestamp Range Query",
                "telemetry",
                "timestamp, machine_id",
                "SELECT COUNT(*) FROM telemetry WHERE timestamp >= NOW() - INTERVAL '24 hours'",
            ),
            (
                "Indexed Machine Health Warning Lookup",
                "machine_health_warnings",
                "machine_id, status",
                "SELECT COUNT(*) FROM machine_health_warnings WHERE status = 'open'",
            ),
            (
                "Energy Wastage Event Machine Filter",
                "energy_wastage_events",
                "machine_id, start_time",
                "SELECT COUNT(*) FROM energy_wastage_events WHERE start_time >= NOW() - INTERVAL '7 days'",
            ),
        ]

        with factory() as session:
            for name, tbl, cols, sql in queries:
                t0 = time.perf_counter()
                res = session.execute(text(sql))
                count = res.scalar() or 0
                elapsed_ms = (time.perf_counter() - t0) * 1000.0

                results.append(
                    DatabaseBenchmarkResult(
                        query_name=name,
                        target_table=tbl,
                        indexed_columns=cols,
                        elapsed_ms=round(elapsed_ms, 2),
                        rows_returned=count,
                    )
                )

        return results

    def run_all(self) -> BenchmarkSuiteReport:
        analytics = self.benchmark_analytics_pipeline()
        api = self.benchmark_api_endpoints()
        db = self.benchmark_database_performance()
        return BenchmarkSuiteReport(
            timestamp=datetime.now().isoformat(),
            analytics_benchmarks=analytics,
            api_benchmarks=api,
            db_benchmarks=db,
        )
