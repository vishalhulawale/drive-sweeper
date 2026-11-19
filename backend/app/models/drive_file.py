from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DriveFile(Base):
    __tablename__ = "drive_files"
    __table_args__ = (
        UniqueConstraint("account_id", "google_file_id", name="uq_drive_files_account_file"),
        Index("ix_drive_files_account_size", "account_id", "size"),
        Index("ix_drive_files_account_md5", "account_id", "md5_checksum"),
        Index("ix_drive_files_account_parent", "account_id", "parent_folder_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    google_file_id: Mapped[str] = mapped_column(String(128))
    account_id: Mapped[int] = mapped_column(ForeignKey("drive_accounts.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(Text)
    mime_type: Mapped[str] = mapped_column(String(255))
    size: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    md5_checksum: Mapped[str | None] = mapped_column(String(32), nullable=True)
    sha256_checksum: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # First parent is the primary one; the full list is kept in parent_ids.
    parent_folder_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    parent_ids: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    created_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    modified_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    web_view_link: Mapped[str | None] = mapped_column(Text, nullable=True)
    trashed: Mapped[bool] = mapped_column(Boolean, default=False)
    is_owned_by_user: Mapped[bool] = mapped_column(Boolean, default=True)
    is_shortcut: Mapped[bool] = mapped_column(Boolean, default=False)
    shortcut_target_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # Perceptual (dHash) hex from the Drive thumbnail. phash_md5 records which file contents it was
    # computed from, so an edited file (new md5) is re-hashed instead of trusted.
    perceptual_hash: Mapped[str | None] = mapped_column(String(16), nullable=True)
    phash_attempted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    phash_md5: Mapped[str | None] = mapped_column(String(32), nullable=True)
    last_scanned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
