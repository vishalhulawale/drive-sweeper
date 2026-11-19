"""scan_jobs.changes_start_token: Changes API baseline captured when a full scan starts

Revision ID: b7d2e9a1c4f3
Revises: a3c1d0e4f5b6
Create Date: 2026-11-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'b7d2e9a1c4f3'
down_revision: Union[str, Sequence[str], None] = 'a3c1d0e4f5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('scan_jobs', sa.Column('changes_start_token', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('scan_jobs', 'changes_start_token')
