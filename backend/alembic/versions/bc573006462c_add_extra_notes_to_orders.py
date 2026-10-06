"""add extra_notes to orders

Revision ID: bc573006462c
Revises: 435d79b9ff07
Create Date: 2026-10-07 00:05:32.808419

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'bc573006462c'
down_revision: Union[str, None] = '435d79b9ff07'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('extra_notes', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('orders', 'extra_notes')
