import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from analytics.config import DEFAULT_BASELINE, DetectionConfig
from analytics.detectors.detector import DetectionEngine
from analytics.models import TelemetryInput
from analytics.services.feature_engine import FeatureEngine
from app.core.config import get_settings
from app.db.models import EnergyWastageEvent, Machine, Site, Telemetry
from app.db.session import create_database_engine, create_session_factory
from app.repositories.wastage_event_repository import WastageEventRepository
from app.services.wastage_event_service import WastageEventService
from simulator.generator import TelemetryGenerator
from simulator.models import Scenario
from simulator.profiles import DEFAULT_PROFILE
from simulator.scenarios import ScenarioController


class WastageEventEndToEndIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        db_url = get_settings().database_url
        if not db_url:
            raise unittest.SkipTest("DATABASE_URL is not configured; skipping integration tests")
        try:
            cls.engine = create_database_engine(db_url)
            cls.session_factory = create_session_factory(cls.engine)
            with cls.engine.connect() as conn:
                pass
        except Exception as exc:
            raise unittest.SkipTest(f"Database connection failed: {exc}")

    @classmethod
    def tearDownClass(cls) -> None:
        if hasattr(cls, "engine"):
            cls.engine.dispose()

    def setUp(self) -> None:
        self.session: Session = self.session_factory()
        self.site_ids: list[UUID] = []
        self.machine_ids: list[UUID] = []

        self.site = Site(name=f"E2E-Site-{uuid4().hex[:8]}", timezone="UTC")
        self.session.add(self.site)
        self.session.flush()
        self.site_ids.append(self.site.id)
        self.session.commit()

        self.repo = WastageEventRepository(self.session)
        self.service = WastageEventService(self.repo)

    def tearDown(self) -> None:
        self.session.rollback()
        # Ensure complete cleanup of all temporary test data
        with self.engine.begin() as conn:
            if self.machine_ids:
                conn.exec_driver_sql(
                    "DELETE FROM energy_wastage_events WHERE machine_id = ANY(%(ids)s)",
                    {"ids": self.machine_ids},
                )
                conn.exec_driver_sql(
                    "DELETE FROM telemetry WHERE machine_id = ANY(%(ids)s)",
                    {"ids": self.machine_ids},
                )
                conn.exec_driver_sql(
                    "DELETE FROM machines WHERE id = ANY(%(ids)s)",
                    {"ids": self.machine_ids},
                )
            if self.site_ids:
                conn.exec_driver_sql(
                    "DELETE FROM sites WHERE id = ANY(%(ids)s)",
                    {"ids": self.site_ids},
                )
        self.session.close()

    def _create_machine(self, identifier: str) -> Machine:
        machine = Machine(
            site_id=self.site.id,
            machine_identifier=f"{identifier}-{uuid4().hex[:6]}",
            name=f"Machine {identifier}",
            machine_type="conveyor",
            status="active",
        )
        self.session.add(machine)
        self.session.commit()
        self.machine_ids.append(machine.id)
        return machine

    def _simulate_and_detect(
        self,
        machine: Machine,
        scenario: Scenario,
        duration_seconds: int = 120,
    ) -> tuple:
        controller = ScenarioController(scenario, DEFAULT_PROFILE)
        generator = TelemetryGenerator(machine_id=machine.id, interval_seconds=1.0)
        feature_engine = FeatureEngine(DEFAULT_BASELINE)
        detector = DetectionEngine(DetectionConfig())

        start = datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc)
        features = []

        # Create and persist raw telemetry, then generate features
        for s in range(duration_seconds):
            step = controller.step_at(float(s))
            record = generator.generate(
                step.state,
                timestamp=start + timedelta(seconds=s),
                state_elapsed_seconds=step.state_elapsed_seconds,
                power_multiplier=step.power_multiplier,
                load_fraction=step.load_fraction,
            )
            # Add telemetry record to session
            raw_telemetry = Telemetry(
                id=uuid4(),
                timestamp=record.timestamp,
                machine_id=record.machine_id,
                sensor_id=record.sensor_id,
                voltage=record.voltage,
                current=record.current,
                active_power=record.active_power,
                reactive_power=record.reactive_power,
                apparent_power=record.apparent_power,
                power_factor=record.power_factor,
                cumulative_energy=record.cumulative_energy,
                rpm=record.rpm,
                temperature=record.temperature,
                load_percentage=record.load_percent,
                operating_state=record.operating_state.value,
            )
            self.session.add(raw_telemetry)

            # Feature input
            telemetry_input = TelemetryInput(
                timestamp=record.timestamp,
                machine_id=record.machine_id,
                sensor_id=record.sensor_id,
                voltage=record.voltage,
                current=record.current,
                active_power=record.active_power,
                reactive_power=record.reactive_power,
                apparent_power=record.apparent_power,
                power_factor=record.power_factor,
                cumulative_energy=record.cumulative_energy,
                rpm=record.rpm,
                temperature=record.temperature,
                load_percent=record.load_percent,
                operating_state=record.operating_state.value,
            )
            features.append(feature_engine.process(telemetry_input))

        self.session.commit()
        events = detector.process(features)
        return events

    def test_e2e_normal_operation_produces_zero_persisted_events(self) -> None:
        machine = self._create_machine("NORMAL")
        events = self._simulate_and_detect(machine, Scenario.NORMAL_OPERATION, 120)

        self.assertEqual(len(events), 0)
        persisted = self.service.persist_many(events)
        self.assertEqual(len(persisted), 0)

        # Confirm 0 rows in database
        count = self.session.scalar(
            select(func.count()).select_from(EnergyWastageEvent).where(
                EnergyWastageEvent.machine_id == machine.id
            )
        )
        self.assertEqual(count, 0)

    def test_e2e_idle_wastage_persisted(self) -> None:
        machine = self._create_machine("IDLE")
        events = self._simulate_and_detect(machine, Scenario.IDLE_WASTAGE, 120)

        self.assertEqual(len(events), 1)
        persisted = self.service.persist_many(events)
        self.assertEqual(len(persisted), 1)
        self.assertTrue(persisted[0].created)

        # Direct database verification
        row = self.session.scalar(
            select(EnergyWastageEvent).where(EnergyWastageEvent.machine_id == machine.id)
        )
        self.assertIsNotNone(row)
        self.assertIn("IDLE_WASTAGE", row.detection_reason)
        self.assertIsNotNone(row.estimated_wasted_energy_kwh)
        self.assertGreater(row.estimated_wasted_energy_kwh, Decimal("0"))
        self.assertEqual(row.status, "detected")

        # Test idempotency on duplicate re-submission
        re_persisted = self.service.persist_many(events)
        self.assertEqual(len(re_persisted), 1)
        self.assertFalse(re_persisted[0].created)

        # Still only 1 row in database
        count = self.session.scalar(
            select(func.count()).select_from(EnergyWastageEvent).where(
                EnergyWastageEvent.machine_id == machine.id
            )
        )
        self.assertEqual(count, 1)

    def test_e2e_low_load_wastage_persisted(self) -> None:
        machine = self._create_machine("LOW-LOAD")
        events = self._simulate_and_detect(machine, Scenario.LOW_LOAD_WASTAGE, 150)

        self.assertEqual(len(events), 1)
        persisted = self.service.persist_many(events)
        self.assertEqual(len(persisted), 1)
        self.assertTrue(persisted[0].created)

        row = self.session.scalar(
            select(EnergyWastageEvent).where(EnergyWastageEvent.machine_id == machine.id)
        )
        self.assertIsNotNone(row)
        self.assertIn("LOW_LOAD_WASTAGE", row.detection_reason)
        self.assertIsNotNone(row.estimated_wasted_energy_kwh)
        self.assertGreater(row.estimated_wasted_energy_kwh, Decimal("0"))

    def test_e2e_abnormal_power_persisted(self) -> None:
        machine = self._create_machine("ABNORMAL")
        events = self._simulate_and_detect(machine, Scenario.ABNORMAL_POWER, 120)

        self.assertEqual(len(events), 1)
        persisted = self.service.persist_many(events)
        self.assertEqual(len(persisted), 1)
        self.assertTrue(persisted[0].created)

        row = self.session.scalar(
            select(EnergyWastageEvent).where(EnergyWastageEvent.machine_id == machine.id)
        )
        self.assertIsNotNone(row)
        self.assertIn("ABNORMAL_POWER", row.detection_reason)
        self.assertIsNotNone(row.estimated_wasted_energy_kwh)
        self.assertGreater(row.estimated_wasted_energy_kwh, Decimal("0"))

    def test_e2e_start_stop_cycling_persisted_with_null_energy(self) -> None:
        machine = self._create_machine("CYCLING")
        events = self._simulate_and_detect(machine, Scenario.START_STOP_CYCLING, 120)

        self.assertEqual(len(events), 1)
        self.assertIsNone(events[0].estimated_wasted_energy_kwh)

        persisted = self.service.persist_many(events)
        self.assertEqual(len(persisted), 1)
        self.assertTrue(persisted[0].created)

        row = self.session.scalar(
            select(EnergyWastageEvent).where(EnergyWastageEvent.machine_id == machine.id)
        )
        self.assertIsNotNone(row)
        self.assertIn("START_STOP_CYCLING", row.detection_reason)
        # CRITICAL: Verify estimated_wasted_energy_kwh is strictly NULL and NOT 0
        self.assertIsNone(row.estimated_wasted_energy_kwh)
        self.assertNotEqual(row.estimated_wasted_energy_kwh, Decimal("0"))
        self.assertNotEqual(row.estimated_wasted_energy_kwh, 0)


if __name__ == "__main__":
    unittest.main()
