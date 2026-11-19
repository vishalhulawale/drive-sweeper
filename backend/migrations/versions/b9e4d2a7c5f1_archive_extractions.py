"""archive_extractions: history and resume state for unpacking archives into Drive folders

Revision ID: b9e4d2a7c5f1
Revises: a8c3e6f0b4d2
Create Date: 2026-11-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'b9e4d2a7c5f1'
down_revision: Union[str, Sequence[str], None] = 'a8c3e6f0b4d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'archive_extractions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('account_id', sa.Integer(), sa.ForeignKey('drive_accounts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('drive_file_id', sa.Integer(), sa.ForeignKey('drive_files.id', ondelete='SET NULL'), nullable=True),
        sa.Column('google_file_id', sa.String(128), nullable=False),
        sa.Column('archive_name', sa.Text(), nullable=False),
        sa.Column('archive_size', sa.BigInteger(), nullable=True),
        sa.Column('archive_md5', sa.String(32), nullable=True),
        sa.Column('web_view_link', sa.Text(), nullable=True),
        sa.Column('folder_name', sa.Text(), nullable=False),
        sa.Column('folder_google_id', sa.String(128), nullable=True),
        sa.Column('status', sa.String(16), nullable=False, server_default='pending'),
        sa.Column('stage', sa.String(16), nullable=False, server_default='queued'),
        sa.Column('files_total', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('files_done', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('files_skipped', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('entries_ignored', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('bytes_total', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('bytes_done', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('archive_trashed', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_archive_extractions_account_file', 'archive_extractions', ['account_id', 'google_file_id'])


def downgrade() -> None:
    op.drop_index('ix_archive_extractions_account_file', 'archive_extractions')
    op.drop_table('archive_extractions')
