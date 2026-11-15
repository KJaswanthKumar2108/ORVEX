from datetime import datetime, timedelta, timezone
from decimal import Decimal
import unittest
from unittest.mock import MagicMock
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from app.api.routes.machines import get_energy_analytics_service
from app.db.models import EnergyWastageEvent, Machine, Telemetry
from app.main import create_app
from app.repositories.machine_repository import MachineRepository
from app.repositories.telemetry_repository import TelemetryRepository
from app.repositories.wastage_event_repository import WastageEventRepository
from app.schemas.energy import EnergyDataQuality, EnergySummaryResponse
from app.services.energy_analytics_service import EnergyAnalyticsService


def make_telemetry(
    machine_id: UUID,
    timestamp: datetime,
    *,
    active_power: float | None = 100.0,
    operating_state: str = "RUNNING",
) -> Telemetry:
    return Telemetry(
        id=uuid4(),
        machine_id=machine_id,
        timestamp=timestamp,
        active_power=active_power,
        operating_state=operating_state,
    )


def make_event(
    machine_id: UUID,
    start_time: datetime,
    end_time: datetime,
    *,
    reason: str = "IDLE_WASTAGE",
    wasted_kwh: float | None = 2.5,
) -> EnergyWastageEvent:
    return EnergyWastageEvent(
        id=uuid4(),
        machine_id=machine_id,
        start_time=start_time,
        end_time=end_time,
        estimated_energy_kwh=Decimal("10.0"),
        estimated_wasted_energy_kwh=Decimal(str(wasted_kwh)) if wasted_kwh is not None else None,
        detection_reason=reason,
        confidence_score=0.9,
        status="detected",
    )


class EnergySummaryApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.app = create_app()
        self.mock_machine_repo = MagicMock(spec=MachineRepository)
        self.mock_telemetry_repo = MagicMock(spec=TelemetryRepository)
        self.mock_event_repo = MagicMock(spec=WastageEventRepository)
        self.service = EnergyAnalyticsService(
            machine_repository=self.mock_machine_repo,
            telemetry_repository=self.mock_telemetry_repo,
            wastage_event_repository=self.mock_event_repo,
            maximum_sample_gap_seconds=30.0,
        )
        self.app.dependency_overrides[get_energy_analytics_service] = lambda: self.service
        self.client = TestClient(self.app)
        self.client.__enter__()

    def tearDown(self) -> None:
        self.client.__exit__(None, None, None)
        self.app.dependency_overrides.clear()

    def test_energy_summary_trapezoidal_integration(self) -> None:
        mid = uuid4()
        t0 = datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc)
        # 3600 seconds of 100 kW constant power = 100 kWh
        t1 = t0 + timedelta(seconds=1800)
        t2 = t0 + timedelta(seconds=3600)

        # Telemetry samples at 10-second intervals for 100s
        records = [
            make_telemetry(mid, t0 + timedelta(seconds=i * 10), active_power=60.0, operating_state="RUNNING")
            for i in range(11)  # 0 to 100 seconds at 60 kW
        ]
        # Energy = 60 kW * (100 / 3600) h = 1.6667 kWh

        self.mock_machine_repo.get_by_id.return_value = Machine(id=mid, name="M")
        self.mock_telemetry_repo.get_all_in_range.return_value = records
        self.mock_event_repo.get_events_intersecting_range.return_value = []

        resp = self.client.get(
            f"/api/v1/machines/{mid}/energy-summary?start_time={t0.isoformat()}&end_time={(t0 + timedelta(seconds=100)).isoformat()}"
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["telemetry_sample_count"], 11)
        self.assertAlmostEqual(data["actual_energy_kwh"], 1.6667, places=3)
        self.assertEqual(data["operating_duration_seconds"], 100.0)
        self.assertEqual(data["data_coverage_ratio"], 1.0)
        self.assertEqual(data["quality"], "GOOD")
        self.assertIsNone(data["estimated_wasted_energy_kwh"])
        self.assertEqual(data["wastage_event_count"], 0)

    def test_energy_summary_gap_handling(self) -> None:
        mid = uuid4()
        t0 = datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc)
        # Two records separated by 120s gap (> 30s max gap threshold)
        rec1 = make_telemetry(mid, t0, active_power=50.0)
        rec2 = make_telemetry(mid, t0 + timedelta(seconds=120), active_power=50.0)

        self.mock_machine_repo.get_by_id.return_value = Machine(id=mid, name="M")
        self.mock_telemetry_repo.get_all_in_range.return_value = [rec1, rec2]
        self.mock_event_repo.get_events_intersecting_range.return_value = []

        resp = self.client.get(
            f"/api/v1/machines/{mid}/energy-summary?start_time={t0.isoformat()}&end_time={(t0 + timedelta(seconds=120)).isoformat()}"
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        # Gap > 30s must NOT be integrated as zero or fabricated energy
        self.assertIsNone(data["actual_energy_kwh"])
        self.assertEqual(data["data_coverage_ratio"], 0.0)
        self.assertEqual(data["quality"], "INSUFFICIENT_DATA")

    def test_energy_summary_missing_telemetry(self) -> None:
        mid = uuid4()
        t0 = datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc)
        t1 = t0 + timedelta(seconds=600)

        self.mock_machine_repo.get_by_id.return_value = Machine(id=mid, name="M")
        self.mock_telemetry_repo.get_all_in_range.return_value = []
        self.mock_event_repo.get_events_intersecting_range.return_value = []

        resp = self.client.get(
            f"/api/v1/machines/{mid}/energy-summary?start_time={t0.isoformat()}&end_time={t1.isoformat()}"
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIsNone(data["actual_energy_kwh"])
        self.assertEqual(data["data_coverage_ratio"], 0.0)
        self.assertEqual(data["quality"], "INSUFFICIENT_DATA")
        self.assertEqual(data["telemetry_sample_count"], 0)

    def test_energy_summary_overlapping_wastage_events_not_double_counted(self) -> None:
        mid = uuid4()
        t0 = datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc)
        t1 = t0 + timedelta(seconds=60)
        t2 = t0 + timedelta(seconds=120)

        # Event 1: [t0, t1] (60s, 3.0 kWh) -> rate = 0.05 kWh/s
        ev1 = make_event(mid, t0, t1, reason="IDLE_WASTAGE", wasted_kwh=3.0)
        # Event 2: [t0 + 30s, t2] (90s, 4.5 kWh) -> rate = 0.05 kWh/s (overlaps with Event 1 between t0+30s and t1)
        ev2 = make_event(mid, t0 + timedelta(seconds=30), t2, reason="ABNORMAL_POWER", wasted_kwh=4.5)

        self.mock_machine_repo.get_by_id.return_value = Machine(id=mid, name="M")
        self.mock_telemetry_repo.get_all_in_range.return_value = []
        self.mock_event_repo.get_events_intersecting_range.return_value = [ev1, ev2]

        resp = self.client.get(
            f"/api/v1/machines/{mid}/energy-summary?start_time={t0.isoformat()}&end_time={t2.isoformat()}"
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["wastage_event_count"], 2)
        # Total span is 120s. At 0.05 kWh/s rate, union energy is 6.0 kWh (NOT 3.0 + 4.5 = 7.5 kWh double-counted!)
        self.assertAlmostEqual(data["estimated_wasted_energy_kwh"], 6.0, places=1)
        # Abnormal power duration is from t0+30s to t2 = 90s
        self.assertEqual(data["abnormal_power_duration_seconds"], 90.0)

    def test_energy_summary_cycling_candidate_null_wasted_energy(self) -> None:
        mid = uuid4()
        t0 = datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc)
        t1 = t0 + timedelta(seconds=120)

        ev = make_event(mid, t0, t1, reason="START_STOP_CYCLING", wasted_kwh=None)

        self.mock_machine_repo.get_by_id.return_value = Machine(id=mid, name="M")
        self.mock_telemetry_repo.get_all_in_range.return_value = []
        self.mock_event_repo.get_events_intersecting_range.return_value = [ev]

        resp = self.client.get(
            f"/api/v1/machines/{mid}/energy-summary?start_time={t0.isoformat()}&end_time={t1.isoformat()}"
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["wastage_event_count"], 1)
        self.assertIsNone(data["estimated_wasted_energy_kwh"])

    def test_energy_summary_unknown_machine_returns_404(self) -> None:
        mid = uuid4()
        self.mock_machine_repo.get_by_id.return_value = None

        resp = self.client.get(
            f"/api/v1/machines/{mid}/energy-summary?start_time=2026-09-26T12:00:00Z&end_time=2026-09-26T13:00:00Z"
        )
        self.assertEqual(resp.status_code, 404)

    def test_energy_summary_invalid_time_range_returns_400(self) -> None:
        mid = uuid4()
        self.mock_machine_repo.get_by_id.return_value = Machine(id=mid, name="M")

        resp = self.client.get(
            f"/api/v1/machines/{mid}/energy-summary?start_time=2026-09-26T13:00:00Z&end_time=2026-09-26T12:00:00Z"
        )
        self.assertEqual(resp.status_code, 400)

    def test_energy_summary_irregular_intervals(self) -> None:
        mid = uuid4()
        t0 = datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc)
        # Irregular sample arrival: 0s, 3s, 10s (dt=7s), 25s (dt=15s), 27s (dt=2s)
        # Power is constant 60 kW.
        # Total interval = 27s. Energy = 60 kW * (27 / 3600) h = 0.45 kWh
        offsets = [0, 3, 10, 25, 27]
        records = [
            make_telemetry(mid, t0 + timedelta(seconds=dt), active_power=60.0, operating_state="RUNNING")
            for dt in offsets
        ]

        self.mock_machine_repo.get_by_id.return_value = Machine(id=mid, name="M")
        self.mock_telemetry_repo.get_all_in_range.return_value = records
        self.mock_event_repo.get_events_intersecting_range.return_value = []

        resp = self.client.get(
            f"/api/v1/machines/{mid}/energy-summary?start_time={t0.isoformat()}&end_time={(t0 + timedelta(seconds=27)).isoformat()}"
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["telemetry_sample_count"], 5)
        self.assertAlmostEqual(data["actual_energy_kwh"], 0.45, places=3)
        self.assertEqual(data["operating_duration_seconds"], 27.0)

    def test_energy_summary_single_sample_insufficient_data(self) -> None:
        mid = uuid4()
        t0 = datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc)
        rec = make_telemetry(mid, t0, active_power=80.0)

        self.mock_machine_repo.get_by_id.return_value = Machine(id=mid, name="M")
        self.mock_telemetry_repo.get_all_in_range.return_value = [rec]
        self.mock_event_repo.get_events_intersecting_range.return_value = []

        resp = self.client.get(
            f"/api/v1/machines/{mid}/energy-summary?start_time={t0.isoformat()}&end_time={(t0 + timedelta(seconds=60)).isoformat()}"
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["telemetry_sample_count"], 1)
        self.assertIsNone(data["actual_energy_kwh"])
        self.assertEqual(data["quality"], "INSUFFICIENT_DATA")

    def test_energy_summary_immune_to_cumulative_counter_resets(self) -> None:
        mid = uuid4()
        t0 = datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc)
        # Even if a physical meter cumulative counter wraps/resets in hardware:
        # e.g. 50000.0 -> 0.0, the active power integration remains completely correct
        r1 = make_telemetry(mid, t0, active_power=50.0)
        r1.cumulative_energy = 50000.0
        r2 = make_telemetry(mid, t0 + timedelta(seconds=10), active_power=50.0)
        r2.cumulative_energy = 0.1  # hardware counter reset!

        self.mock_machine_repo.get_by_id.return_value = Machine(id=mid, name="M")
        self.mock_telemetry_repo.get_all_in_range.return_value = [r1, r2]
        self.mock_event_repo.get_events_intersecting_range.return_value = []

        resp = self.client.get(
            f"/api/v1/machines/{mid}/energy-summary?start_time={t0.isoformat()}&end_time={(t0 + timedelta(seconds=10)).isoformat()}"
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        # 50 kW * (10 / 3600) h = 0.1389 kWh, NOT affected by 50000 -> 0 counter reset
        self.assertAlmostEqual(data["actual_energy_kwh"], 0.1389, places=3)


if __name__ == "__main__":
    unittest.main()
