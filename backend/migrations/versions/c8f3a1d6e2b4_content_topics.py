"""content topics: the topic folder Claude picked for a file from its contents

Revision ID: c8f3a1d6e2b4
Revises: b9e4d2a7c5f1
Create Date: 2026-11-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'c8f3a1d6e2b4'
down_revision: Union[str, Sequence[str], None] = 'b9e4d2a7c5f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('drive_files', sa.Column('content_topic', sa.String(120), nullable=True))
    op.add_column('drive_files', sa.Column('topic_summary', sa.Text(), nullable=True))
    op.add_column('drive_files', sa.Column('topic_confidence', sa.String(8), nullable=True))
    op.add_column('drive_files', sa.Column('topic_key', sa.String(64), nullable=True))
    op.add_column('drive_files', sa.Column('topic_attempted_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    for col in ('topic_attempted_at', 'topic_key', 'topic_confidence', 'topic_summary', 'content_topic'):
        op.drop_column('drive_files', col)
