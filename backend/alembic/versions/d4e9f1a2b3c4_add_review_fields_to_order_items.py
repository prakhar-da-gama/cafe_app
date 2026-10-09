"""add review fields to order_items and service_reviews table

Revision ID: d4e9f1a2b3c4
Revises: bc573006462c
Create Date: 2026-10-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd4e9f1a2b3c4'
down_revision: Union[str, None] = 'bc573006462c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Star rating (0-5) and free-text review, both left blank until the customer
    # reviews a completed order line.
    op.add_column('order_items', sa.Column('rating', sa.Integer(), nullable=True))
    op.add_column('order_items', sa.Column('review', sa.Text(), nullable=True))

    # Uploaded review photo paths. Added nullable, backfilled to an empty array
    # for existing rows, then made NOT NULL to match the model (default list).
    op.add_column(
        'order_items',
        sa.Column('review_photo_paths', sa.JSON(), nullable=True),
    )
    op.execute(
        "UPDATE order_items SET review_photo_paths = '[]' "
        "WHERE review_photo_paths IS NULL"
    )
    op.alter_column(
        'order_items',
        'review_photo_paths',
        existing_type=sa.JSON(),
        nullable=False,
    )

    # Overall per-order service reviews.
    op.create_table(
        'service_reviews',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('order_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('rating', sa.Integer(), nullable=False),
        sa.Column('review', sa.Text(), nullable=True),
        sa.Column('review_images', sa.JSON(), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('order_id'),
    )
    op.create_index(
        'ix_service_reviews_user_id', 'service_reviews', ['user_id']
    )


def downgrade() -> None:
    op.drop_index('ix_service_reviews_user_id', table_name='service_reviews')
    op.drop_table('service_reviews')
    op.drop_column('order_items', 'review_photo_paths')
    op.drop_column('order_items', 'review')
    op.drop_column('order_items', 'rating')
