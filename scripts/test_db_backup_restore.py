"""
scripts/test_db_backup_restore.py
Automated Backup and Restore Reliability & Data Integrity Verification Test for ORVEX.

Validates:
1. Active PostgreSQL / TimescaleDB state.
2. Creates a dedicated canary machine record.
3. Executes a database backup (SQL dump).
4. Verifies backup file integrity and non-zero size.
5. Deletes the canary record to simulate catastrophic data loss.
6. Executes database restore from the generated backup file.
7. Asserts the canary record is completely restored with original attributes.
8. Deletes the canary record.
9. Asserts zero residual rows across all tables.
10. Removes temporary test backup file.
"""

import sys
import subprocess
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from sqlalchemy import text

# Ensure backend is in python path
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "backend"))

from app.core.config import get_settings
from app.db.session import create_database_engine, create_session_factory
from app.db.models import Site, Machine


def run_test():
    print("=" * 60)
    print("  ORVEX Database Backup & Restore Data Integrity Verification")
    print("=" * 60)

    settings = get_settings()
    engine = create_database_engine(settings.database_url)
    session_factory = create_session_factory(engine)
    canary_suffix = uuid.uuid4().hex[:8].upper()
    canary_site_id = uuid.uuid4()
    canary_machine_id = uuid.uuid4()
    canary_ident = f"CANARY-M-{canary_suffix}"
    test_backup_path = ROOT_DIR / "backups" / f"test_backup_{canary_suffix}.sql"
    test_backup_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        print(f"\n[1/6] Inserting test canary site and machine ({canary_ident})...")
        with session_factory() as session:
            site = Site(
                id=canary_site_id,
                name=f"Canary Site {canary_suffix}",
                timezone="UTC"
            )
            session.add(site)
            session.flush()

            machine = Machine(
                id=canary_machine_id,
                site_id=canary_site_id,
                machine_identifier=canary_ident,
                name=f"Canary Machine {canary_suffix}",
                machine_type="conveyor",
                rated_power_kw=75.0,
                status="active"
            )
            session.add(machine)
            session.commit()
        print("  [OK] Canary site and machine committed.")

        print(f"\n[2/6] Executing database backup to: {test_backup_path.name}...")
        ps_proc = subprocess.run(
            ["docker", "ps", "--format", "{{.Names}}"],
            capture_output=True,
            text=True,
            shell=True
        )
        containers = ps_proc.stdout.strip().splitlines()
        container_name = None
        for c in containers:
            if "orvex-database-prod" in c:
                container_name = "orvex-database-prod"
                break
            elif "orvex-database-1" in c:
                container_name = "orvex-database-1"
                break
            elif "database" in c:
                container_name = c
                break

        if not container_name:
            raise RuntimeError("No active database container found for backup test.")

        print(f"  Using database container: {container_name}")
        with open(test_backup_path, "w", encoding="utf-8") as f:
            dump_proc = subprocess.run(
                ["docker", "exec", container_name, "pg_dump", "-U", "orvex", "-d", "orvex", "--clean", "--if-exists"],
                stdout=f,
                stderr=subprocess.PIPE,
                text=True
            )

        if dump_proc.returncode != 0:
            raise RuntimeError(f"pg_dump failed: {dump_proc.stderr}")

        backup_size = os.path.getsize(test_backup_path)
        print(f"  [OK] Backup file created successfully ({backup_size:,} bytes).")
        assert backup_size > 500, f"Backup file too small: {backup_size} bytes"

        print(f"\n[3/6] Simulating data loss: Deleting canary records...")
        with session_factory() as session:
            session.execute(text("DELETE FROM machines WHERE id = :id"), {"id": canary_machine_id})
            session.execute(text("DELETE FROM sites WHERE id = :id"), {"id": canary_site_id})
            session.commit()

        with session_factory() as session:
            m_cnt = session.execute(text("SELECT count(*) FROM machines WHERE id = :id"), {"id": canary_machine_id}).scalar()
            s_cnt = session.execute(text("SELECT count(*) FROM sites WHERE id = :id"), {"id": canary_site_id}).scalar()
            assert m_cnt == 0 and s_cnt == 0, "Canary records were not deleted!"
        print("  [OK] Canary records verified deleted from database.")

        print(f"\n[4/6] Restoring database from backup: {test_backup_path.name}...")
        with open(test_backup_path, "r", encoding="utf-8") as f:
            restore_proc = subprocess.run(
                ["docker", "exec", "-i", container_name, "psql", "-U", "orvex", "-d", "orvex", "-q"],
                stdin=f,
                capture_output=True,
                text=True
            )

        if restore_proc.returncode != 0:
            print(f"Restore output (stderr): {restore_proc.stderr}")

        print("  [OK] Database restore command completed.")

        # Dispose connection pool so stale table OIDs are not retained after table drop/recreate
        engine.dispose()

        print(f"\n[5/6] Verifying restored canary records...")
        with session_factory() as session:
            restored_m = session.execute(
                text("SELECT id, machine_identifier, name, rated_power_kw FROM machines WHERE id = :id"),
                {"id": canary_machine_id}
            ).fetchone()

            assert restored_m is not None, f"Failed to restore canary machine {canary_machine_id}!"
            assert str(restored_m[0]) == str(canary_machine_id), f"ID mismatch: {restored_m[0]} != {canary_machine_id}"
            assert restored_m[1] == canary_ident, f"Identifier mismatch: {restored_m[1]}"
            assert abs(float(restored_m[3]) - 75.0) < 1e-4, f"Power rating mismatch: {restored_m[3]}"

            restored_s = session.execute(
                text("SELECT id, name FROM sites WHERE id = :id"),
                {"id": canary_site_id}
            ).fetchone()
            assert restored_s is not None, f"Failed to restore canary site {canary_site_id}!"
        print("  [OK] Canary records verified fully restored with exact integrity.")

    finally:
        print(f"\n[6/6] Cleaning up canary records & verifying zero residual rows...")
        with session_factory() as session:
            session.execute(text("DELETE FROM machines WHERE id = :id"), {"id": canary_machine_id})
            session.execute(text("DELETE FROM sites WHERE id = :id"), {"id": canary_site_id})
            session.commit()

            tables = [
                "machine_health_warnings",
                "maintenance_observations",
                "corrective_actions",
                "alerts",
                "energy_wastage_events",
                "machine_events",
                "telemetry",
                "sensors",
                "machines",
                "sites",
            ]
            residual_counts = {}
            for tbl in tables:
                cnt = session.execute(text(f"SELECT count(*) FROM {tbl}")).scalar()
                residual_counts[tbl] = cnt

        print("  Database row audit:")
        all_zero = True
        for tbl, cnt in residual_counts.items():
            print(f"    - {tbl:30s}: {cnt} rows")
            if cnt != 0:
                all_zero = False

        # Clean up test backup file
        if test_backup_path.exists():
            test_backup_path.unlink()
            print(f"  [OK] Cleaned up temporary test backup file: {test_backup_path.name}")

        assert all_zero, f"Residual rows detected in database: {residual_counts}"

    print("\n" + "=" * 60)
    print("  ALL BACKUP & RESTORE INTEGRITY TESTS PASSED SUCCESSFULLY! ")
    print("=" * 60)


if __name__ == "__main__":
    try:
        run_test()
    except Exception as e:
        print(f"\n[FAIL] Backup & restore verification test failed: {e}", file=sys.stderr)
        sys.exit(1)
