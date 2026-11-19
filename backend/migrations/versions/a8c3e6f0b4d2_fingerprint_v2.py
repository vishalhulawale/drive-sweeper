"""Similar photos: stronger fingerprint (256-bit hash + grey/colour detail, versioned)

Revision ID: a8c3e6f0b4d2
Revises: f7b2c5d9e3a1
Create Date: 2026-11-19

Existing 64-bit hashes have no version, so every photo counts as pending and is fingerprinted again
with the new method on the next analysis run.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'a8c3e6f0b4d2'
down_revision: Union[str, Sequence[str], None] = 'f7b2c5d9e3a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('drive_files', 'perceptual_hash', existing_type=sa.String(16), type_=sa.String(64))
    op.add_column('drive_files', sa.Column('phash_detail', sa.LargeBinary(), nullable=True))
    op.add_column('drive_files', sa.Column('phash_version', sa.SmallInteger(), nullable=True))


def downgrade() -> None:
    op.drop_column('drive_files', 'phash_version')
    op.drop_column('drive_files', 'phash_detail')
    # New 256-bit hashes do not fit the old column; clearing them makes those photos pending again.
    op.execute("UPDATE drive_files SET perceptual_hash = NULL, phash_md5 = NULL WHERE length(perceptual_hash) > 16")
    op.alter_column('drive_files', 'perceptual_hash', existing_type=sa.String(64), type_=sa.String(16))
