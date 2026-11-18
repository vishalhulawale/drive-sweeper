"""Read-side queries over the local inventory (kept apart from the scan write path)."""
from sqlalchemy import Select, and_, case, exists, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.models import DriveFile, ScanJob

FOLDER = "application/vnd.google-apps.folder"
SHORTCUT = "application/vnd.google-apps.shortcut"
GAPPS = "application/vnd.google-apps."

SORTS = {
    "name": func.lower(DriveFile.name),
    "size": DriveFile.size,
    "modified": DriveFile.modified_time,
    "created": DriveFile.created_time,
}


def _like_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _is_top_level(account_id: int):
    """Top level = no parent, or a parent we never listed (Drive does not return the My Drive root)."""
    parent = aliased(DriveFile)
    parent_known = exists().where(
        parent.account_id == account_id, parent.google_file_id == DriveFile.parent_folder_id
    )
    return or_(DriveFile.parent_folder_id.is_(None), ~parent_known)


def _filtered(account_id: int, parent: str | None, q: str | None, kind: str | None, trashed: bool) -> Select:
    stmt = select(DriveFile).where(DriveFile.account_id == account_id)
    if not trashed:
        stmt = stmt.where(DriveFile.trashed.is_(False))
    if q:
        stmt = stmt.where(DriveFile.name.ilike(f"%{_like_escape(q)}%", escape="\\"))
    elif parent == "root":
        stmt = stmt.where(_is_top_level(account_id))
    elif parent:
        stmt = stmt.where(DriveFile.parent_folder_id == parent)
    if kind == "folder":
        stmt = stmt.where(DriveFile.mime_type == FOLDER)
    elif kind == "file":
        stmt = stmt.where(~DriveFile.mime_type.like(GAPPS + "%"))
    elif kind == "doc":
        stmt = stmt.where(
            DriveFile.mime_type.like(GAPPS + "%"), DriveFile.mime_type.notin_([FOLDER, SHORTCUT])
        )
    return stmt


def list_files(db, account_id, *, parent=None, q=None, kind=None, trashed=False,
               sort="name", order="asc", page=1, page_size=50):
    stmt = _filtered(account_id, parent, q, kind, trashed)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    col = SORTS.get(sort, SORTS["name"])
    direction = col.desc().nulls_last() if order == "desc" else col.asc().nulls_last()
    # Folders first when sorting by name, then a stable tiebreak on id.
    folders_first = case((DriveFile.mime_type == FOLDER, 0), else_=1)
    order_by = [folders_first, direction] if sort == "name" else [direction]
    rows = db.scalars(
        stmt.order_by(*order_by, DriveFile.id).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return rows, total


def get_by_google_id(db: Session, account_id: int, google_id: str) -> DriveFile | None:
    return db.scalar(
        select(DriveFile).where(DriveFile.account_id == account_id, DriveFile.google_file_id == google_id)
    )


def folder_tree(db: Session, account_id: int, parent: str | None):
    """Folders directly under `parent` ('root' or None = top level) with their subfolder counts."""
    child = aliased(DriveFile)
    child_count = (
        select(func.count())
        .where(
            child.account_id == account_id,
            child.parent_folder_id == DriveFile.google_file_id,
            child.mime_type == FOLDER,
            child.trashed.is_(False),
        )
        .scalar_subquery()
    )
    stmt = select(DriveFile.google_file_id, DriveFile.name, child_count).where(
        DriveFile.account_id == account_id, DriveFile.mime_type == FOLDER, DriveFile.trashed.is_(False)
    )
    if parent in (None, "root"):
        stmt = stmt.where(_is_top_level(account_id))
    else:
        stmt = stmt.where(DriveFile.parent_folder_id == parent)
    return db.execute(stmt.order_by(func.lower(DriveFile.name))).all()


def breadcrumb(db: Session, account_id: int, google_id: str, max_depth: int = 50):
    """Ancestors from the top level down to (and including) the given folder."""
    path, seen, current = [], set(), google_id
    while current and current not in seen and len(path) < max_depth:
        seen.add(current)
        f = get_by_google_id(db, account_id, current)
        if f is None:
            break
        path.append(f)
        current = f.parent_folder_id
    return list(reversed(path))


def summary(db: Session, account_id: int) -> dict:
    gdoc = and_(DriveFile.mime_type.like(GAPPS + "%"), DriveFile.mime_type.notin_([FOLDER, SHORTCUT]))
    row = db.execute(
        select(
            func.count(),
            func.count().filter(DriveFile.mime_type == FOLDER),
            func.count().filter(gdoc),
            func.count().filter(DriveFile.is_shortcut),
            func.count().filter(DriveFile.trashed),
            func.count().filter(DriveFile.is_owned_by_user.is_(False)),
            func.coalesce(func.sum(DriveFile.size).filter(DriveFile.trashed.is_(False)), 0),
        ).where(DriveFile.account_id == account_id)
    ).one()
    last = db.scalar(
        select(func.max(ScanJob.completed_at)).where(
            ScanJob.account_id == account_id, ScanJob.status == "completed"
        )
    )
    total, folders, gdocs, shortcuts, trashed, shared, size = row
    return {
        "total_items": total,
        "files": total - folders - gdocs - shortcuts,
        "folders": folders,
        "google_docs": gdocs,
        "shortcuts": shortcuts,
        "trashed": trashed,
        "shared_with_me": shared,
        "total_size": int(size),
        "last_scan_completed_at": last,
    }
