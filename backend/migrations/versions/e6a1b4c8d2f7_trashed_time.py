"""drive_files.trashed_time

Revision ID: e6a1b4c8d2f7
Revises: d5f9a3b7c1e2
Create Date: 2026-11-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'e6a1b4c8d2f7'
down_revision: Union[str, Sequence[str], None] = 'd5f9a3b7c1e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('drive_files', sa.Column('trashed_time', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('drive_files', 'trashed_time')
