"""perceptual hash columns on drive_files

Revision ID: d5f9a3b7c1e2
Revises: c4e8f1a2b9d5
Create Date: 2026-11-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'd5f9a3b7c1e2'
down_revision: Union[str, Sequence[str], None] = 'c4e8f1a2b9d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('drive_files', sa.Column('perceptual_hash', sa.String(length=16), nullable=True))
    op.add_column('drive_files', sa.Column('phash_attempted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('drive_files', sa.Column('phash_md5', sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column('drive_files', 'phash_md5')
    op.drop_column('drive_files', 'phash_attempted_at')
    op.drop_column('drive_files', 'perceptual_hash')
