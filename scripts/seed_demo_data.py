"""ORVEX Demo Data Seeder for Frontend Validation.

Populates temporary machines, telemetry, and wastage events (including a cycling candidate with null wasted energy)
to validate the live React frontend. Also includes --cleanup flag to restore 0 database rows.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import sys
from uuid import UUID, uuid4

sys.path.insert(0, "backend")

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import EnergyWastageEvent, Machine, Site, Telemetry
from app.db.session import create_database_engine, create_session_factory

SITE_ID = UUID("00000000-0000-0000-0000-000000000001")
MACHINE_1_ID = UUID("00000000-0000-0000-0000-000000000011")
MACHINE_2_ID = UUID("00000000-0000-0000-0000-000000000022")
MACHINE_3_ID = UUID("00000000-0000-0000-0000-000000000033")
EVENT_1_ID = UUID("00000000-0000-0000-0000-000000000101")
EVENT_2_ID = UUID("00000000-0000-0000-0000-000000000202")

ALL_MACHINE_IDS = [MACHINE_1_ID, MACHINE_2_ID, MACHINE_3_ID]


def cleanup_data(session: Session) -> None:
    print("Cleaning up demo data...")
    with session.get_bind().begin() as conn:
        conn.exec_driver_sql(
            "DELETE FROM energy_wastage_events WHERE machine_id = ANY(%(mids)s)",
            {"mids": ALL_MACHINE_IDS},
        )
        conn.exec_driver_sql(
            "DELETE FROM telemetry WHERE machine_id = ANY(%(mids)s)",
            {"mids": ALL_MACHINE_IDS},
        )
        conn.exec_driver_sql(
            "DELETE FROM machines WHERE id = ANY(%(mids)s)",
            {"mids": ALL_MACHINE_IDS},
        )
        conn.exec_driver_sql(
            "DELETE FROM sites WHERE id = %(sid)s",
            {"sid": SITE_ID},
        )
    print("Cleanup complete.")


def seed_data(session: Session) -> None:
    cleanup_data(session)
    print("Seeding demo data for frontend validation...")

    now = datetime.now(timezone.utc)

    # 1. Site
    site = Site(
        id=SITE_ID,
        name="Pilbara Iron Ore Pit #4",
        timezone="Australia/Perth",
    )
    session.add(site)
    session.flush()

    # 2. Machines
    m1 = Machine(
        id=MACHINE_1_ID,
        site_id=SITE_ID,
        machine_identifier="CONV-01",
        name="Primary Overland Conveyor",
        machine_type="conveyor",
        rated_power_kw=Decimal("132.0"),
        status="active",
    )
    m2 = Machine(
        id=MACHINE_2_ID,
        site_id=SITE_ID,
        machine_identifier="PUMP-02",
        name="High-Pressure Slurry Pump",
        machine_type="pump",
        rated_power_kw=Decimal("75.0"),
        status="active",
    )
    m3 = Machine(
        id=MACHINE_3_ID,
        site_id=SITE_ID,
        machine_identifier="FAN-03",
        name="Shaft Ventilation Fan 3",
        machine_type="fan",
        rated_power_kw=Decimal("55.0"),
        status="active",
    )
    session.add_all([m1, m2, m3])
    session.flush()

    # 3. Telemetry for Machine 1 (Conveyor)
    start_m1 = now - timedelta(minutes=25)
    telemetry_records = []
    for i in range(30):
        t = start_m1 + timedelta(seconds=i * 30)
        p = 85.0 + (i % 5) * 2.5
        state = "operating"
        if i >= 18 and i < 26:
            p = 22.0  # idle excess power
            state = "idle"
        elif i >= 26:
            p = 0.0
            state = "stopped"

        rec = Telemetry(
            id=uuid4(),
            timestamp=t,
            machine_id=MACHINE_1_ID,
            voltage=Decimal("415.2"),
            current=Decimal(str(round(p * 1.6, 2))),
            active_power=Decimal(str(round(p, 2))),
            reactive_power=Decimal("12.4"),
            apparent_power=Decimal(str(round(p * 1.05, 2))),
            power_factor=Decimal("0.92"),
            cumulative_energy=Decimal(str(round(12400.0 + i * 0.5, 2))),
            rpm=Decimal("1480.0") if state != "stopped" else Decimal("0.0"),
            temperature=Decimal("64.5"),
            load_percentage=float(round((p / 132.0) * 100.0, 1)),
            operating_state=state,
        )
        telemetry_records.append(rec)

    # 4. Telemetry for Machine 2 (Slurry Pump - cycling pattern)
    start_m2 = now - timedelta(minutes=20)
    for i in range(25):
        t = start_m2 + timedelta(seconds=i * 35)
        is_on = (i % 4) < 2
        p = 68.0 if is_on else 0.0
        state = "operating" if is_on else "stopped"

        rec = Telemetry(
            id=uuid4(),
            timestamp=t,
            machine_id=MACHINE_2_ID,
            voltage=Decimal("415.0"),
            current=Decimal("95.0") if is_on else Decimal("0.0"),
            active_power=Decimal(str(p)),
            reactive_power=Decimal("8.0") if is_on else Decimal("0.0"),
            apparent_power=Decimal(str(round(p * 1.04, 2))),
            power_factor=Decimal("0.94") if is_on else Decimal("0.0"),
            cumulative_energy=Decimal(str(round(5600.0 + i * 0.3, 2))),
            rpm=Decimal("1750.0") if is_on else Decimal("0.0"),
            temperature=Decimal("58.2"),
            load_percentage=float(round((p / 75.0) * 100.0, 1)),
            operating_state=state,
        )
        telemetry_records.append(rec)

    session.add_all(telemetry_records)
    session.flush()

    # 5. Wastage Events
    ev1 = EnergyWastageEvent(
        id=EVENT_1_ID,
        machine_id=MACHINE_1_ID,
        start_time=start_m1 + timedelta(seconds=18 * 30),
        end_time=start_m1 + timedelta(seconds=26 * 30),
        estimated_energy_kwh=Decimal("1.46"),
        estimated_wasted_energy_kwh=Decimal("1.46"),
        detection_reason="IDLE_WASTAGE",
        confidence_score=0.95,
        status="detected",
    )

    # Cycling candidate: estimated_wasted_energy_kwh = None (preserves null!)
    ev2 = EnergyWastageEvent(
        id=EVENT_2_ID,
        machine_id=MACHINE_2_ID,
        start_time=start_m2,
        end_time=start_m2 + timedelta(seconds=20 * 35),
        estimated_energy_kwh=Decimal("6.50"),
        estimated_wasted_energy_kwh=None,  # Intentionally NULL!
        detection_reason="START_STOP_CYCLING",
        confidence_score=0.89,
        status="detected",
    )
    session.add_all([ev1, ev2])
    session.commit()
    print("Seed complete: 3 machines, 55 telemetry records, 2 wastage events.")


def main():
    settings = get_settings()
    engine = create_database_engine(settings.database_url)
    session_factory = create_session_factory(engine)
    session: Session = session_factory()

    try:
        if "--cleanup" in sys.argv:
            cleanup_data(session)
        else:
            seed_data(session)
    finally:
        session.close()
        engine.dispose()


if __name__ == "__main__":
    main()
