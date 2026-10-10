"""add tenant_rights table

Revision ID: a1b2c3d4e5f6
Revises: d4e9f1a2b3c4
Create Date: 2026-10-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'd4e9f1a2b3c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Per-tenant entitlements for paid AI features (single row for this cafe).
    op.create_table(
        'tenant_rights',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('ai_access_expiry', sa.DateTime(), nullable=True),
        sa.Column('total_credits', sa.BigInteger(), nullable=False),
        sa.Column('credits_used', sa.BigInteger(), nullable=False),
        sa.Column('credits_limit_reset_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('tenant_rights')
