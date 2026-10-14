"""add location columns to tenant_rights

Revision ID: e5f6a7b8c9d0
Revises: d5e6f7a8b9c0
Create Date: 2026-10-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'd5e6f7a8b9c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Where the cafe physically is, used by the weather MCP tool. A human
    # readable name (geocoded on demand) plus optional precise coordinates
    # that, when present, are preferred and skip the geocoding round-trip.
    op.add_column(
        'tenant_rights',
        sa.Column('location', sa.String(length=255), nullable=True),
    )
    op.add_column(
        'tenant_rights',
        sa.Column('latitude', sa.Float(), nullable=True),
    )
    op.add_column(
        'tenant_rights',
        sa.Column('longitude', sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('tenant_rights', 'longitude')
    op.drop_column('tenant_rights', 'latitude')
    op.drop_column('tenant_rights', 'location')
