"""Allow detection candidates without a wasted-energy estimate.

Revision ID: 0002_nullable_wasted_energy
Revises: 0001_initial_schema
Create Date: 2026-09-26
"""

from alembic import op
import sqlalchemy as sa

revision = "0002_nullable_wasted_energy"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "energy_wastage_events",
        "estimated_wasted_energy_kwh",
        existing_type=sa.Numeric(precision=14, scale=4),
        nullable=True,
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM energy_wastage_events
                WHERE estimated_wasted_energy_kwh IS NULL
            ) THEN
                RAISE EXCEPTION
                    'Cannot restore NOT NULL while cycling candidates have unknown wasted energy';
            END IF;
        END $$;
        """
    )
    op.alter_column(
        "energy_wastage_events",
        "estimated_wasted_energy_kwh",
        existing_type=sa.Numeric(precision=14, scale=4),
        nullable=False,
    )