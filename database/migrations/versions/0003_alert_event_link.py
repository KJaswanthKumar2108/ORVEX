"""Add event_id foreign key and title to alerts table.

Revision ID: 0003_alert_event_link
Revises: 0002_nullable_wasted_energy
Create Date: 2026-10-30
"""

from alembic import op
import sqlalchemy as sa

revision = "0003_alert_event_link"
down_revision = "0002_nullable_wasted_energy"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("alerts", sa.Column("event_id", sa.Uuid(), nullable=True))
    op.add_column("alerts", sa.Column("title", sa.String(length=200), nullable=True))
    op.create_foreign_key(
        "fk_alerts_event_id_energy_wastage_events",
        "alerts",
        "energy_wastage_events",
        ["event_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_alerts_event_id",
        "alerts",
        ["event_id"],
        unique=True,
        postgresql_where=sa.text("event_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_alerts_event_id", table_name="alerts")
    op.drop_constraint(
        "fk_alerts_event_id_energy_wastage_events", "alerts", type_="foreignkey"
    )
    op.drop_column("alerts", "title")
    op.drop_column("alerts", "event_id")

