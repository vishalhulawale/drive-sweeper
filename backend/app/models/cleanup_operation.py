from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CleanupOperation(Base):
    __tablename__ = "cleanup_operations"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("drive_accounts.id", ondelete="CASCADE"))
    # SET NULL, not CASCADE: history must outlive the file row (a file leaves the local inventory when it
    # is permanently deleted in Drive, e.g. Trash emptied). The snapshot columns keep the record readable.
    drive_file_id: Mapped[int | None] = mapped_column(ForeignKey("drive_files.id", ondelete="SET NULL"), nullable=True)
    google_file_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    file_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_size: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    web_view_link: Mapped[str | None] = mapped_column(Text, nullable=True)
    operation_type: Mapped[str] = mapped_column(String(16))  # trash | restore | move
    previous_parent_ids: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    @classmethod
    def for_file(cls, f, **kw) -> "CleanupOperation":
        """A history row for file f, with a snapshot of what it was called and where it lived."""
        return cls(drive_file_id=f.id, google_file_id=f.google_file_id, file_name=f.name, file_size=f.size,
                   web_view_link=f.web_view_link, **kw)
