from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ScanJob(Base):
    __tablename__ = "scan_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("drive_accounts.id", ondelete="CASCADE"))
    # pending | running | completed | failed | cancelled
    status: Mapped[str] = mapped_column(String(16), default="pending")
    total_files: Mapped[int | None] = mapped_column(Integer, nullable=True)
    processed_files: Mapped[int] = mapped_column(Integer, default=0)
    next_page_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Changes API baseline, taken BEFORE listing starts so edits made during the scan are not missed.
    changes_start_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
