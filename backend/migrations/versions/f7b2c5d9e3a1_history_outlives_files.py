"""cleanup_operations keeps its history when the file row is deleted

Revision ID: f7b2c5d9e3a1
Revises: e6a1b4c8d2f7
Create Date: 2026-11-19

Before: drive_file_id was ON DELETE CASCADE, so when a file left the inventory (permanently deleted in
Drive, e.g. Trash emptied) its trash/restore/move history was deleted with it. Now the link is set to
NULL and a snapshot of the file (id, name, size, link) on the history row keeps it readable.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'f7b2c5d9e3a1'
down_revision: Union[str, Sequence[str], None] = 'e6a1b4c8d2f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

FK = 'cleanup_operations_drive_file_id_fkey'


def upgrade() -> None:
    op.add_column('cleanup_operations', sa.Column('google_file_id', sa.String(128), nullable=True))
    op.add_column('cleanup_operations', sa.Column('file_name', sa.Text(), nullable=True))
    op.add_column('cleanup_operations', sa.Column('file_size', sa.BigInteger(), nullable=True))
    op.add_column('cleanup_operations', sa.Column('web_view_link', sa.Text(), nullable=True))
    op.execute(
        "UPDATE cleanup_operations o SET google_file_id = f.google_file_id, file_name = f.name, "
        "file_size = f.size, web_view_link = f.web_view_link FROM drive_files f WHERE f.id = o.drive_file_id"
    )
    op.drop_constraint(FK, 'cleanup_operations', type_='foreignkey')
    op.alter_column('cleanup_operations', 'drive_file_id', existing_type=sa.Integer(), nullable=True)
    op.create_foreign_key(FK, 'cleanup_operations', 'drive_files', ['drive_file_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.execute("DELETE FROM cleanup_operations WHERE drive_file_id IS NULL")
    op.drop_constraint(FK, 'cleanup_operations', type_='foreignkey')
    op.alter_column('cleanup_operations', 'drive_file_id', existing_type=sa.Integer(), nullable=False)
    op.create_foreign_key(FK, 'cleanup_operations', 'drive_files', ['drive_file_id'], ['id'], ondelete='CASCADE')
    for col in ('web_view_link', 'file_size', 'file_name', 'google_file_id'):
        op.drop_column('cleanup_operations', col)
