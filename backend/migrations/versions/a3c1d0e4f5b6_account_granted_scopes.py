"""store granted OAuth scopes on drive_accounts

Revision ID: a3c1d0e4f5b6
Revises: 986bf5dd6d46
Create Date: 2026-11-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'a3c1d0e4f5b6'
down_revision: Union[str, Sequence[str], None] = '986bf5dd6d46'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('drive_accounts', sa.Column('granted_scopes', sa.Text(), nullable=True))
    # Accounts connected before this column existed only ever had the read-only scope.
    op.execute(
        "UPDATE drive_accounts SET granted_scopes = "
        "'openid https://www.googleapis.com/auth/userinfo.email "
        "https://www.googleapis.com/auth/drive.metadata.readonly'"
    )


def downgrade() -> None:
    op.drop_column('drive_accounts', 'granted_scopes')
