from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DuplicateGroup(Base):
    __tablename__ = "duplicate_groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("drive_accounts.id", ondelete="CASCADE"))
    detection_type: Mapped[str] = mapped_column(String(16), default="exact")
    hash_algorithm: Mapped[str] = mapped_column(String(16))  # md5 | sha256
    content_hash: Mapped[str] = mapped_column(String(64))
    file_count: Mapped[int] = mapped_column(Integer)
    total_size: Mapped[int] = mapped_column(BigInteger)
    potential_savings: Mapped[int] = mapped_column(BigInteger)  # (N - 1) * S
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DuplicateGroupFile(Base):
    __tablename__ = "duplicate_group_files"

    id: Mapped[int] = mapped_column(primary_key=True)
    duplicate_group_id: Mapped[int] = mapped_column(ForeignKey("duplicate_groups.id", ondelete="CASCADE"))
    drive_file_id: Mapped[int] = mapped_column(ForeignKey("drive_files.id", ondelete="CASCADE"))
    recommended_action: Mapped[str | None] = mapped_column(String(16), nullable=True)  # keep | trash
    user_selected_action: Mapped[str | None] = mapped_column(String(16), nullable=True)
