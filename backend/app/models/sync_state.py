from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, true
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SyncState(Base):
    __tablename__ = "sync_state"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("drive_accounts.id", ondelete="CASCADE"), unique=True)
    changes_page_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sync_status: Mapped[str] = mapped_column(String(16), default="idle")
    auto_sync_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    auto_sync_minutes: Mapped[int] = mapped_column(Integer, default=15, server_default="15")
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
