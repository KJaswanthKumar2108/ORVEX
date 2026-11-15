"""Create core ORVEX database schema and telemetry hypertable.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-09-26
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb")

    op.create_table(
        "sites",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("location", sa.Text(), nullable=True),
        sa.Column("timezone", sa.String(length=64), server_default=sa.text("'UTC'"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("length(trim(name)) > 0", name="ck_sites_name_not_empty"),
        sa.CheckConstraint("length(trim(timezone)) > 0", name="ck_sites_timezone_not_empty"),
        sa.PrimaryKeyConstraint("id", name="pk_sites"),
    )

    op.create_table(
        "machines",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("site_id", sa.Uuid(), nullable=False),
        sa.Column("machine_identifier", sa.String(length=128), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("machine_type", sa.String(length=100), nullable=False),
        sa.Column("manufacturer", sa.String(length=200), nullable=True),
        sa.Column("model", sa.String(length=200), nullable=True),
        sa.Column("rated_power_kw", sa.Numeric(precision=12, scale=3), nullable=True),
        sa.Column("status", sa.String(length=24), server_default=sa.text("'active'"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("length(trim(machine_identifier)) > 0", name="ck_machines_machine_identifier_not_empty"),
        sa.CheckConstraint("length(trim(name)) > 0", name="ck_machines_name_not_empty"),
        sa.CheckConstraint("rated_power_kw IS NULL OR rated_power_kw > 0", name="ck_machines_rated_power_positive"),
        sa.CheckConstraint(
            "status IN ('active', 'inactive', 'maintenance', 'decommissioned')", name="ck_machines_status_valid"
        ),
        sa.ForeignKeyConstraint(["site_id"], ["sites.id"], name="fk_machines_site_id_sites", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name="pk_machines"),
        sa.UniqueConstraint("site_id", "machine_identifier", name="uq_machines_site_identifier"),
    )
    op.create_index("ix_machines_site_status", "machines", ["site_id", "status"])

    op.create_table(
        "sensors",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("machine_id", sa.Uuid(), nullable=False),
        sa.Column("sensor_identifier", sa.String(length=128), nullable=False),
        sa.Column("sensor_type", sa.String(length=100), nullable=False),
        sa.Column("unit", sa.String(length=32), nullable=False),
        sa.Column("installation_info", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("status", sa.String(length=24), server_default=sa.text("'active'"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("length(trim(sensor_identifier)) > 0", name="ck_sensors_sensor_identifier_not_empty"),
        sa.CheckConstraint("length(trim(sensor_type)) > 0", name="ck_sensors_sensor_type_not_empty"),
        sa.CheckConstraint("length(trim(unit)) > 0", name="ck_sensors_unit_not_empty"),
        sa.CheckConstraint("status IN ('active', 'inactive', 'faulty', 'maintenance')", name="ck_sensors_status_valid"),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"], name="fk_sensors_machine_id_machines", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name="pk_sensors"),
        sa.UniqueConstraint("machine_id", "id", name="uq_sensors_machine_id"),
        sa.UniqueConstraint("machine_id", "sensor_identifier", name="uq_sensors_machine_identifier"),
    )
    op.create_index("ix_sensors_machine_status", "sensors", ["machine_id", "status"])

    op.create_table(
        "telemetry",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("machine_id", sa.Uuid(), nullable=False),
        sa.Column("sensor_id", sa.Uuid(), nullable=True),
        sa.Column("voltage", sa.Float(), nullable=True),
        sa.Column("current", sa.Float(), nullable=True),
        sa.Column("active_power", sa.Float(), nullable=True),
        sa.Column("reactive_power", sa.Float(), nullable=True),
        sa.Column("apparent_power", sa.Float(), nullable=True),
        sa.Column("power_factor", sa.Float(), nullable=True),
        sa.Column("cumulative_energy", sa.Float(), nullable=True),
        sa.Column("rpm", sa.Float(), nullable=True),
        sa.Column("temperature", sa.Float(), nullable=True),
        sa.Column("load_percentage", sa.Float(), nullable=True),
        sa.Column("operating_state", sa.String(length=32), nullable=True),
        sa.CheckConstraint("voltage IS NULL OR voltage >= 0", name="ck_telemetry_voltage_nonnegative"),
        sa.CheckConstraint("current IS NULL OR current >= 0", name="ck_telemetry_current_nonnegative"),
        sa.CheckConstraint("apparent_power IS NULL OR apparent_power >= 0", name="ck_telemetry_apparent_power_nonnegative"),
        sa.CheckConstraint("power_factor IS NULL OR power_factor BETWEEN -1 AND 1", name="ck_telemetry_power_factor_range"),
        sa.CheckConstraint("cumulative_energy IS NULL OR cumulative_energy >= 0", name="ck_telemetry_energy_nonnegative"),
        sa.CheckConstraint("rpm IS NULL OR rpm >= 0", name="ck_telemetry_rpm_nonnegative"),
        sa.CheckConstraint("load_percentage IS NULL OR load_percentage BETWEEN 0 AND 100", name="ck_telemetry_load_percentage_range"),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"], name="fk_telemetry_machine", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["machine_id", "sensor_id"], ["sensors.machine_id", "sensors.id"],
            name="fk_telemetry_sensor_machine", ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("timestamp", "id", name="pk_telemetry"),
    )
    op.execute(
        "SELECT create_hypertable('telemetry', 'timestamp', "
        "if_not_exists => TRUE, migrate_data => TRUE)"
    )
    op.create_index("ix_telemetry_machine_time", "telemetry", ["machine_id", sa.text("timestamp DESC")])
    op.create_index("ix_telemetry_sensor_time", "telemetry", ["sensor_id", sa.text("timestamp DESC")])

    op.create_table(
        "machine_events",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("machine_id", sa.Uuid(), nullable=False),
        sa.Column("event_type", sa.String(length=48), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("event_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "event_type IN ('machine_started', 'machine_stopped', 'machine_idle', "
            "'machine_returned_to_operation', 'abnormal_condition')",
            name="ck_machine_events_event_type_valid",
        ),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"], name="fk_machine_events_machine_id_machines", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name="pk_machine_events"),
    )
    op.create_index("ix_machine_events_machine_time", "machine_events", ["machine_id", sa.text("occurred_at DESC")])

    op.create_table(
        "alerts",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("machine_id", sa.Uuid(), nullable=False),
        sa.Column("alert_type", sa.String(length=100), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=16), server_default=sa.text("'open'"), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("length(trim(alert_type)) > 0", name="ck_alerts_alert_type_not_empty"),
        sa.CheckConstraint("severity IN ('info', 'low', 'medium', 'high', 'critical')", name="ck_alerts_severity_valid"),
        sa.CheckConstraint("status IN ('open', 'acknowledged', 'resolved', 'dismissed')", name="ck_alerts_status_valid"),
        sa.CheckConstraint("(status = 'resolved') = (resolved_at IS NOT NULL)", name="ck_alerts_resolved_at_consistent"),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"], name="fk_alerts_machine_id_machines", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name="pk_alerts"),
    )
    op.create_index("ix_alerts_machine_time", "alerts", ["machine_id", sa.text("occurred_at DESC")])
    op.create_index("ix_alerts_status_time", "alerts", ["status", sa.text("occurred_at DESC")])

    op.create_table(
        "energy_wastage_events",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("machine_id", sa.Uuid(), nullable=False),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "duration_seconds",
            sa.Float(),
            sa.Computed("EXTRACT(EPOCH FROM (end_time - start_time))", persisted=True),
            nullable=True,
        ),
        sa.Column("estimated_energy_kwh", sa.Numeric(precision=14, scale=4), nullable=False),
        sa.Column("estimated_wasted_energy_kwh", sa.Numeric(precision=14, scale=4), nullable=False),
        sa.Column("detection_reason", sa.Text(), nullable=False),
        sa.Column("confidence_score", sa.Float(), nullable=True),
        sa.Column("status", sa.String(length=16), server_default=sa.text("'detected'"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("end_time IS NULL OR end_time >= start_time", name="ck_energy_wastage_events_time_order_valid"),
        sa.CheckConstraint("estimated_energy_kwh >= 0", name="ck_energy_wastage_events_estimated_energy_nonnegative"),
        sa.CheckConstraint("estimated_wasted_energy_kwh >= 0", name="ck_energy_wastage_events_wasted_energy_nonnegative"),
        sa.CheckConstraint(
            "estimated_wasted_energy_kwh <= estimated_energy_kwh",
            name="ck_energy_wastage_events_wasted_energy_within_total",
        ),
        sa.CheckConstraint("confidence_score IS NULL OR confidence_score BETWEEN 0 AND 1", name="ck_energy_wastage_events_confidence_range"),
        sa.CheckConstraint("length(trim(detection_reason)) > 0", name="ck_energy_wastage_events_detection_reason_not_empty"),
        sa.CheckConstraint("status IN ('detected', 'confirmed', 'dismissed', 'resolved')", name="ck_energy_wastage_events_status_valid"),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"], name="fk_energy_wastage_events_machine_id_machines", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name="pk_energy_wastage_events"),
    )
    op.create_index("ix_energy_wastage_machine_start", "energy_wastage_events", ["machine_id", sa.text("start_time DESC")])
    op.create_index("ix_energy_wastage_status_start", "energy_wastage_events", ["status", sa.text("start_time DESC")])


def downgrade() -> None:
    op.drop_index("ix_energy_wastage_status_start", table_name="energy_wastage_events")
    op.drop_index("ix_energy_wastage_machine_start", table_name="energy_wastage_events")
    op.drop_table("energy_wastage_events")

    op.drop_index("ix_alerts_status_time", table_name="alerts")
    op.drop_index("ix_alerts_machine_time", table_name="alerts")
    op.drop_table("alerts")

    op.drop_index("ix_machine_events_machine_time", table_name="machine_events")
    op.drop_table("machine_events")

    op.drop_index("ix_telemetry_sensor_time", table_name="telemetry")
    op.drop_index("ix_telemetry_machine_time", table_name="telemetry")
    op.drop_table("telemetry")

    op.drop_index("ix_sensors_machine_status", table_name="sensors")
    op.drop_table("sensors")

    op.drop_index("ix_machines_site_status", table_name="machines")
    op.drop_table("machines")
    op.drop_table("sites")