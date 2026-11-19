"""auto sync settings on sync_state

Revision ID: c4e8f1a2b9d5
Revises: b7d2e9a1c4f3
Create Date: 2026-11-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'c4e8f1a2b9d5'
down_revision: Union[str, Sequence[str], None] = 'b7d2e9a1c4f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sync_state', sa.Column('auto_sync_enabled', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column('sync_state', sa.Column('auto_sync_minutes', sa.Integer(), nullable=False, server_default='15'))
    op.add_column('sync_state', sa.Column('last_error', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('sync_state', 'last_error')
    op.drop_column('sync_state', 'auto_sync_minutes')
    op.drop_column('sync_state', 'auto_sync_enabled')
