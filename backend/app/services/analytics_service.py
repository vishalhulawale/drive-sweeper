"""Storage analytics computed from the local inventory. Read-only.

"Storage used" counts files you own (shared-with-me files do not use your quota). Trashed files are
reported separately because Drive still counts them until the Trash is emptied.
"""
from collections import defaultdict

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import DriveFile

FOLDER = "application/vnd.google-apps.folder"
GAPPS = "application/vnd.google-apps."

ARCHIVE_MIMES = {
    "application/zip", "application/x-zip-compressed", "application/x-rar-compressed",
    "application/vnd.rar", "application/x-7z-compressed", "application/gzip", "application/x-tar",
    "application/x-gzip", "application/x-bzip2", "application/x-apple-diskimage",
}
DOCUMENT_HINTS = ("pdf", "msword", "officedocument", "opendocument", "text/", "rtf", "epub", "json", "xml")

CATEGORIES = ["Images", "Videos", "Audio", "Documents", "Archives", "Other"]


def category_of(mime: str) -> str:
    if mime.startswith("image/"):
        return "Images"
    if mime.startswith("video/"):
        return "Videos"
    if mime.startswith("audio/"):
        return "Audio"
    if mime in ARCHIVE_MIMES:
        return "Archives"
    if any(h in mime for h in DOCUMENT_HINTS):
        return "Documents"
    return "Other"


def _owned_files(account_id: int, *, trashed: bool):
    return (
        DriveFile.account_id == account_id,
        DriveFile.trashed.is_(trashed),
        DriveFile.is_owned_by_user.is_(True),
        DriveFile.mime_type != FOLDER,
        ~DriveFile.mime_type.like(GAPPS + "%"),
        DriveFile.size.is_not(None),
    )


def overview(db: Session, account_id: int) -> dict:
    rows = db.execute(
        select(DriveFile.mime_type, func.count(), func.coalesce(func.sum(DriveFile.size), 0))
        .where(*_owned_files(account_id, trashed=False))
        .group_by(DriveFile.mime_type)
    ).all()
    cats = {c: {"category": c, "files": 0, "bytes": 0} for c in CATEGORIES}
    for mime, n, size in rows:
        c = cats[category_of(mime)]
        c["files"] += n
        c["bytes"] += int(size)
    trashed_files, trashed_bytes = db.execute(
        select(func.count(), func.coalesce(func.sum(DriveFile.size), 0))
        .where(*_owned_files(account_id, trashed=True))
    ).one()
    return {
        "total_bytes": sum(c["bytes"] for c in cats.values()),
        "total_files": sum(c["files"] for c in cats.values()),
        "trashed_bytes": int(trashed_bytes),
        "trashed_files": trashed_files,
        "categories": sorted(cats.values(), key=lambda c: -c["bytes"]),
    }


def by_year(db: Session, account_id: int) -> list[dict]:
    year = func.extract("year", DriveFile.created_time)
    rows = db.execute(
        select(year, func.count(), func.coalesce(func.sum(DriveFile.size), 0))
        .where(*_owned_files(account_id, trashed=False), DriveFile.created_time.is_not(None))
        .group_by(year)
        .order_by(year)
    ).all()
    return [{"year": int(y), "files": n, "bytes": int(b)} for y, n, b in rows]


def largest_files(db: Session, account_id: int, limit: int = 25) -> list[DriveFile]:
    return list(
        db.scalars(
            select(DriveFile)
            .where(*_owned_files(account_id, trashed=False))
            .order_by(DriveFile.size.desc(), DriveFile.id)
            .limit(limit)
        )
    )


def largest_folders(db: Session, account_id: int, limit: int = 25) -> list[dict]:
    """Folder size = all owned, live files below it. Each file counts under its primary parent chain."""
    rows = db.execute(
        select(
            DriveFile.google_file_id, DriveFile.name, DriveFile.parent_folder_id, DriveFile.mime_type,
            DriveFile.size, DriveFile.is_owned_by_user,
        ).where(DriveFile.account_id == account_id, DriveFile.trashed.is_(False))
    ).all()
    parent: dict[str, str | None] = {}
    names: dict[str, str] = {}
    for gid, name, pid, mime, _size, _own in rows:
        if mime == FOLDER:
            parent[gid] = pid
            names[gid] = name

    total: dict[str, int] = defaultdict(int)
    count: dict[str, int] = defaultdict(int)
    for gid, _name, pid, mime, size, owned in rows:
        if mime == FOLDER or not owned or not size or mime.startswith(GAPPS):
            continue
        seen: set[str] = set()
        cur = pid
        while cur and cur in parent and cur not in seen:  # `seen` guards against cycles
            seen.add(cur)
            total[cur] += size
            count[cur] += 1
            cur = parent[cur]

    ranked = sorted(total, key=lambda k: -total[k])[:limit]
    return [
        {"google_file_id": k, "name": names[k], "bytes": total[k], "files": count[k]}
        for k in ranked
    ]
