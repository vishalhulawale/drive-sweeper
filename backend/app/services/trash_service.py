"""Trash overview from the local inventory. Read-only; this module never empties or deletes anything.

Drive removes items from Trash automatically 30 days after they were trashed, and until then they still
count against your storage. Emptying Trash early is permanent, so the app only shows what is there and
points you to Drive to do it yourself.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import CleanupOperation, DriveFile

AUTO_DELETE_DAYS = 30
SOON_DAYS = 7  # "deleting soon" = fewer than this many days left
FOLDER = "application/vnd.google-apps.folder"


def _trashed(account_id: int):
    return (DriveFile.account_id == account_id, DriveFile.trashed.is_(True), DriveFile.is_owned_by_user.is_(True))


def auto_delete_at(trashed_time: datetime | None) -> datetime | None:
    return trashed_time + timedelta(days=AUTO_DELETE_DAYS) if trashed_time else None


def overview(db: Session, account_id: int, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    soon_cutoff = now - timedelta(days=AUTO_DELETE_DAYS - SOON_DAYS)  # trashed before this => deleting soon
    row = db.execute(
        select(
            func.count().filter(DriveFile.mime_type != FOLDER),
            func.coalesce(func.sum(DriveFile.size).filter(DriveFile.mime_type != FOLDER), 0),
            func.count().filter(DriveFile.mime_type == FOLDER),
            func.count().filter(DriveFile.mime_type != FOLDER, DriveFile.trashed_time.is_(None)),
            func.count().filter(DriveFile.mime_type != FOLDER, DriveFile.trashed_time <= soon_cutoff),
            func.coalesce(func.sum(DriveFile.size).filter(DriveFile.mime_type != FOLDER,
                                                          DriveFile.trashed_time <= soon_cutoff), 0),
            func.min(DriveFile.trashed_time),
        ).where(*_trashed(account_id))
    ).one()
    files, size, folders, undated, soon_files, soon_bytes, oldest = row
    return {
        "files": files, "bytes": int(size), "folders": folders,
        "undated_files": undated, "deleting_soon_files": soon_files, "deleting_soon_bytes": int(soon_bytes),
        "oldest_trashed_at": oldest, "auto_delete_days": AUTO_DELETE_DAYS,
        "next_auto_delete_at": auto_delete_at(oldest),
    }


def items(db: Session, account_id: int, sort: str = "size", page: int = 1, page_size: int = 50):
    by_app = (
        select(CleanupOperation.drive_file_id)
        .where(CleanupOperation.account_id == account_id, CleanupOperation.operation_type == "trash",
               CleanupOperation.status == "completed")
        .scalar_subquery()
    )
    order = {
        "size": [DriveFile.size.desc().nulls_last(), DriveFile.id],
        "deletes": [DriveFile.trashed_time.asc().nulls_last(), DriveFile.id],
        "name": [func.lower(DriveFile.name), DriveFile.id],
    }[sort]
    base = (*_trashed(account_id), DriveFile.mime_type != FOLDER)
    total = db.scalar(select(func.count()).select_from(DriveFile).where(*base)) or 0
    rows = db.execute(
        select(DriveFile, DriveFile.id.in_(by_app).label("by_app")).where(*base)
        .order_by(*order).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return total, rows


def apply_trash_dates(db: Session, account_id: int, dates: dict[str, datetime | None]) -> int:
    """dates: google_file_id -> trashed time (from Drive). Returns rows updated."""
    if not dates:
        return 0
    rows = db.scalars(select(DriveFile).where(DriveFile.account_id == account_id,
                                              DriveFile.google_file_id.in_(list(dates))))
    n = 0
    for f in rows:
        if f.trashed and dates[f.google_file_id] and f.trashed_time != dates[f.google_file_id]:
            f.trashed_time = dates[f.google_file_id]
            n += 1
    return n


def refresh_dates(db: Session, account_id: int, client) -> dict:
    """Ask Drive when each Trash item was trashed (one cheap metadata listing)."""
    from app.services.file_scanner import _parse_time  # same RFC 3339 parser the scanner uses

    updated = seen = 0
    token = None
    while True:
        page, token = client.list_trashed_page(token)
        dates = {f["id"]: _parse_time(f.get("trashedTime")) for f in page}
        seen += len(dates)
        updated += apply_trash_dates(db, account_id, dates)
        db.commit()
        if token is None:
            break
    return {"seen": seen, "updated": updated}


