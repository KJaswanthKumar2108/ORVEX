"""Add machine_health_warnings and maintenance_observations tables.

Revision ID: 0004_machine_health_monitoring
Revises: 0003_alert_event_link
Create Date: 2026-11-04
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0004_machine_health_monitoring"
down_revision = "0003_alert_event_link"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "machine_health_warnings",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("machine_id", sa.Uuid(), nullable=False),
        sa.Column("warning_type", sa.String(length=64), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), server_default=sa.text("'open'"), nullable=False),
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("window_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("observed_value", sa.Float(), nullable=False),
        sa.Column("baseline_value", sa.Float(), nullable=True),
        sa.Column("threshold_value", sa.Float(), nullable=True),
        sa.Column("unit", sa.String(length=32), nullable=False),
        sa.Column("severity_rationale", sa.Text(), nullable=False),
        sa.Column("telemetry_evidence", sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"), nullable=False),
        sa.Column("confidence_score", sa.Float(), nullable=False),
        sa.Column("data_quality", sa.String(length=32), nullable=False),
        sa.Column("recommended_action", sa.Text(), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_by", sa.String(length=128), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("length(trim(warning_type)) > 0", name="warning_type_not_empty"),
        sa.CheckConstraint("severity IN ('NORMAL', 'WATCH', 'WARNING', 'CRITICAL')", name="warning_severity_valid"),
        sa.CheckConstraint("status IN ('open', 'acknowledged', 'resolved')", name="warning_status_valid"),
        sa.CheckConstraint("confidence_score BETWEEN 0 AND 1", name="warning_confidence_range"),
        sa.CheckConstraint("length(trim(severity_rationale)) > 0", name="severity_rationale_not_empty"),
        sa.CheckConstraint("length(trim(recommended_action)) > 0", name="recommended_action_not_empty"),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_machine_health_warnings_machine_time",
        "machine_health_warnings",
        ["machine_id", sa.text("detected_at DESC")],
    )
    op.create_index(
        "ix_machine_health_warnings_status",
        "machine_health_warnings",
        ["status"],
    )
    op.create_index(
        "ix_machine_health_warnings_type_status",
        "machine_health_warnings",
        ["machine_id", "warning_type", "status"],
    )

    op.create_table(
        "maintenance_observations",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("machine_id", sa.Uuid(), nullable=False),
        sa.Column("warning_id", sa.Uuid(), nullable=True),
        sa.Column("inspector_name", sa.String(length=128), nullable=False),
        sa.Column("inspection_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("suspected_issue", sa.String(length=255), nullable=False),
        sa.Column("corrective_action", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=16), server_default=sa.text("'open'"), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("length(trim(inspector_name)) > 0", name="inspector_name_not_empty"),
        sa.CheckConstraint("length(trim(suspected_issue)) > 0", name="suspected_issue_not_empty"),
        sa.CheckConstraint("status IN ('open', 'acknowledged', 'resolved')", name="observation_status_valid"),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["warning_id"], ["machine_health_warnings.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_maintenance_observations_machine_time",
        "maintenance_observations",
        ["machine_id", sa.text("inspection_date DESC")],
    )
    op.create_index(
        "ix_maintenance_observations_status",
        "maintenance_observations",
        ["status"],
    )


def downgrade() -> None:
    op.drop_table("maintenance_observations")
    op.drop_table("machine_health_warnings")

