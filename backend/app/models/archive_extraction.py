from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ArchiveExtraction(Base):
    """One archive unpacked into a new Drive folder next to it. Kept as history; a failed or cancelled
    row remembers the folder it created so the next attempt resumes into it."""
    __tablename__ = "archive_extractions"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("drive_accounts.id", ondelete="CASCADE"))
    drive_file_id: Mapped[int | None] = mapped_column(ForeignKey("drive_files.id", ondelete="SET NULL"), nullable=True)
    google_file_id: Mapped[str] = mapped_column(String(128))
    archive_name: Mapped[str] = mapped_column(Text)
    archive_size: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    archive_md5: Mapped[str | None] = mapped_column(String(32), nullable=True)
    web_view_link: Mapped[str | None] = mapped_column(Text, nullable=True)
    folder_name: Mapped[str] = mapped_column(Text)
    folder_google_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # pending | running | completed | failed | cancelled
    status: Mapped[str] = mapped_column(String(16), default="pending")
    # queued | checking | downloading | uploading | trashing | done
    stage: Mapped[str] = mapped_column(String(16), default="queued")
    files_total: Mapped[int] = mapped_column(Integer, default=0)
    files_done: Mapped[int] = mapped_column(Integer, default=0)
    files_skipped: Mapped[int] = mapped_column(Integer, default=0)  # already uploaded by an earlier attempt
    entries_ignored: Mapped[int] = mapped_column(Integer, default=0)  # links, unsafe paths, macOS metadata
    bytes_total: Mapped[int] = mapped_column(BigInteger, default=0)
    bytes_done: Mapped[int] = mapped_column(BigInteger, default=0)
    archive_trashed: Mapped[bool] = mapped_column(Boolean, default=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
