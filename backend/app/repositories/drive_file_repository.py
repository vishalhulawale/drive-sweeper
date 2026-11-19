from datetime import datetime

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import DriveFile

_UPDATE_COLUMNS = [
    "name", "mime_type", "size", "md5_checksum", "sha256_checksum", "parent_folder_id", "parent_ids",
    "created_time", "modified_time", "web_view_link", "trashed", "is_owned_by_user",
    "is_shortcut", "shortcut_target_id", "trashed_time", "last_scanned_at",
]


def upsert_files(db: Session, account_id: int, rows: list[dict]) -> None:
    """Idempotent insert-or-update keyed by (account_id, google_file_id)."""
    if not rows:
        return
    # sha256_checksum comes from Drive (sha256Checksum) like md5, so Drive's current value always wins.
    values = [{**r, "account_id": account_id} for r in rows]
    stmt = insert(DriveFile).values(values)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_drive_files_account_file",
        set_={c: stmt.excluded[c] for c in _UPDATE_COLUMNS},
    )
    db.execute(stmt)


def delete_not_seen_since(db: Session, account_id: int, cutoff: datetime) -> int:
    """Remove local rows for files that a complete scan no longer saw (gone or inaccessible)."""
    result = db.execute(
        delete(DriveFile).where(
            DriveFile.account_id == account_id,
            (DriveFile.last_scanned_at < cutoff) | (DriveFile.last_scanned_at.is_(None)),
        )
    )
    return result.rowcount or 0


def count_files(db: Session, account_id: int) -> int:
    return db.scalar(select(func.count()).select_from(DriveFile).where(DriveFile.account_id == account_id)) or 0
