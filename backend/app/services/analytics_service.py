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


def _folder_totals(db: Session, account_id: int):
    """Folder tree and sizes. A folder's size is all owned, live files below it; each file counts under its
    primary parent chain. Also returns what sits directly in each folder ("" = the top level of My Drive)."""
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
    direct_bytes: dict[str, int] = defaultdict(int)
    direct_files: dict[str, int] = defaultdict(int)
    for gid, _name, pid, mime, size, owned in rows:
        if mime == FOLDER or not owned or not size or mime.startswith(GAPPS):
            continue
        here = pid if pid in parent else ""
        direct_bytes[here] += size
        direct_files[here] += 1
        seen: set[str] = set()
        cur = pid
        while cur and cur in parent and cur not in seen:  # `seen` guards against cycles
            seen.add(cur)
            total[cur] += size
            count[cur] += 1
            cur = parent[cur]
    return parent, names, total, count, direct_bytes, direct_files


def largest_folders(db: Session, account_id: int, limit: int = 25) -> list[dict]:
    """Folder size = all owned, live files below it. Each file counts under its primary parent chain."""
    _parent, names, total, count, _db, _df = _folder_totals(db, account_id)
    ranked = sorted(total, key=lambda k: -total[k])[:limit]
    return [
        {"google_file_id": k, "name": names[k], "bytes": total[k], "files": count[k]}
        for k in ranked
    ]


def folder_tree(db: Session, account_id: int, folder_id: str | None) -> dict:
    """One level of the folder tree for the storage treemap: the folders inside `folder_id` (None = top level)
    with their total sizes, plus the files that sit directly in it."""
    parent, names, total, count, direct_bytes, direct_files = _folder_totals(db, account_id)
    key = folder_id or ""
    if folder_id is not None and folder_id not in parent:
        raise KeyError(folder_id)
    children = [
        {
            "google_file_id": gid, "name": names[gid], "bytes": total[gid], "files": count[gid],
            "has_subfolders": False,
        }
        for gid, pid in parent.items()
        if (pid if pid in parent else "") == key and gid != folder_id and total[gid] > 0
    ]
    with_kids = {pid for pid in parent.values() if pid in parent}
    for c in children:
        c["has_subfolders"] = c["google_file_id"] in with_kids
    children.sort(key=lambda c: -c["bytes"])
    return {
        "folder_id": folder_id,
        "name": names.get(folder_id, "My Drive") if folder_id else "My Drive",
        "bytes": total[folder_id] if folder_id else sum(direct_bytes.values()),
        "children": children,
        "loose_bytes": direct_bytes[key],
        "loose_files": direct_files[key],
    }
