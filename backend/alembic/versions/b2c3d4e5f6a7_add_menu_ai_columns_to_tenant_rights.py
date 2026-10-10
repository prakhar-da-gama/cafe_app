"""add menu AI columns to tenant_rights

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-10-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Cache of the AI menu-assistant's understanding of the menu, and a flag that
    # marks it stale after the menu is added to.
    op.add_column(
        'tenant_rights',
        sa.Column(
            'menu_changed', sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    op.add_column(
        'tenant_rights',
        sa.Column('current_menu_description', sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('tenant_rights', 'current_menu_description')
    op.drop_column('tenant_rights', 'menu_changed')
