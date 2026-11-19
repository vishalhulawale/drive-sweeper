"""Smart organizer: suggest which existing folder a loose file belongs in, then move it (undoable).

Suggestions use metadata only and are deterministic. A destination folder is described by the files
directly inside it: what kinds of files they are, the span of their modification dates, and their
filename patterns. A file is matched to the folder it most resembles.

Moves are the only write: add the new parent, remove the old one. Nothing is renamed or deleted.
"""
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CleanupOperation, DriveFile
from app.services.analytics_service import FOLDER, GAPPS, category_of
from app.services.google_drive import DriveError

log = logging.getLogger(__name__)

MIN_FOLDER_FILES = 5          # a folder needs this many direct files to be a destination
MIN_CATEGORY_SHARE = 0.5      # at least half the folder must be the same kind of file
MIN_SCORE = 0.6
HIGH_SCORE = 0.8
DATE_GRACE_DAYS = 30          # how far outside a folder's date span still counts as a (weaker) fit
MAX_MOVES = 200
_EARLIEST = datetime(1990, 1, 1, tzinfo=timezone.utc)  # earlier timestamps are upload artifacts


def stem_of(name: str) -> str:
    """Filename pattern: lower-case letters of the base name ('IMG_0877.HEIC' -> 'img')."""
    base = name.rsplit(".", 1)[0] if "." in name else name
    letters = re.sub(r"[^a-z]+", " ", base.lower()).strip()
    return " ".join(letters.split()[:2])


def _when(f) -> datetime | None:
    t = f.modified_time or f.created_time
    return t if t and t >= _EARLIEST else None


@dataclass
class Profile:
    folder: object
    n: int
    categories: Counter
    stems: Counter
    lo: datetime | None
    hi: datetime | None
    dates: list = field(default_factory=list)


def _percentile(sorted_vals: list, p: float):
    return sorted_vals[min(len(sorted_vals) - 1, max(0, int(round(p * (len(sorted_vals) - 1)))))]


def build_profiles(files: list, folders: dict) -> dict[str, Profile]:
    kids: dict[str, list] = {}
    for f in files:
        if f.mime_type != FOLDER and f.parent_folder_id in folders:
            kids.setdefault(f.parent_folder_id, []).append(f)
    profiles = {}
    for fid, children in kids.items():
        if len(children) < MIN_FOLDER_FILES:
            continue
        dates = sorted(d for d in (_when(c) for c in children) if d)
        profiles[fid] = Profile(
            folder=folders[fid], n=len(children),
            categories=Counter(category_of(c.mime_type) for c in children),
            stems=Counter(s for s in (stem_of(c.name) for c in children) if s),
            lo=_percentile(dates, 0.05) if dates else None,
            hi=_percentile(dates, 0.95) if dates else None,
        )
    return profiles


def score(f, p: Profile) -> tuple[float, list[str]] | None:
    cat = category_of(f.mime_type)
    share = p.categories[cat] / p.n
    if share < MIN_CATEGORY_SHARE:
        return None
    when = _when(f)
    if when is None or p.lo is None:
        return None
    if p.lo <= when <= p.hi:
        date_score, date_note = 1.0, f"dated within this folder's range ({p.lo:%b %Y} to {p.hi:%b %Y})"
    else:
        gap = (p.lo - when if when < p.lo else when - p.hi) / timedelta(days=1)
        date_score = max(0.0, 1 - gap / DATE_GRACE_DAYS)
        if date_score == 0:
            return None
        date_note = f"dated {int(gap)} days outside this folder's range ({p.lo:%b %Y} to {p.hi:%b %Y})"
    stem = stem_of(f.name)
    stem_hits = p.stems[stem] if stem else 0
    stem_score = min(1.0, (stem_hits / p.n) * 2)
    total = 0.35 * share + 0.40 * date_score + 0.25 * stem_score
    reasons = [f"{round(share * 100)}% of the {p.n} files here are {cat.lower()}", date_note]
    if stem_hits:
        reasons.append(f"{stem_hits} files here have a similar name pattern (\"{stem}\")")
    return total, reasons


def propose(files: list, source: str = "root", limit: int = 200) -> list[dict]:
    """files: every live (not trashed) DriveFile-like row, any owner. Returns suggestions, best first.

    Only files you own are moved, and only into folders you own. Folders owned by others still count
    when deciding what is "loose": a file inside a shared folder is already filed."""
    all_folder_ids = {f.google_file_id for f in files if f.mime_type == FOLDER}
    folders = {f.google_file_id: f for f in files if f.mime_type == FOLDER and f.is_owned_by_user}
    profiles = build_profiles(files, folders)
    if source == "root":
        is_source = lambda f: f.parent_folder_id is None or f.parent_folder_id not in all_folder_ids  # noqa: E731
    else:
        is_source = lambda f: f.parent_folder_id == source  # noqa: E731

    out = []
    for f in files:
        if f.mime_type == FOLDER or f.mime_type.startswith(GAPPS) or not f.is_owned_by_user or not is_source(f):
            continue
        best = None
        for fid, p in profiles.items():
            if fid == f.parent_folder_id or fid == f.google_file_id:
                continue
            s = score(f, p)
            if s is None:
                continue
            span = (p.hi - p.lo).days if p.lo and p.hi else 10**6
            key = (s[0], -span, p.n)  # tie-break: tighter date span, then bigger folder
            if best is None or key > best[0]:
                best = (key, fid, p, s)
        if best and best[3][0] >= MIN_SCORE:
            _key, fid, p, (total, reasons) = best
            out.append({
                "file": f, "folder_id": fid, "folder_name": p.folder.name,
                "score": round(total, 2), "confidence": "high" if total >= HIGH_SCORE else "medium",
                "reasons": reasons,
            })
    out.sort(key=lambda s: (-s["score"], s["file"].name))
    return out[:limit]


def live_files(db: Session, account_id: int) -> list[DriveFile]:
    return list(db.scalars(
        select(DriveFile).where(DriveFile.account_id == account_id, DriveFile.trashed.is_(False))
    ))


# ---- applying moves -------------------------------------------------------------------------


class TooManyMoves(Exception):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _finish(db: Session, op: CleanupOperation, status: str, error: str | None) -> None:
    op.status = status
    op.error_message = error
    op.completed_at = _now()
    db.commit()


MOVE_WORKERS = 4


def apply_moves(db: Session, account_id: int, client, moves: list[dict]) -> list[CleanupOperation]:
    """moves: [{"file_id": google id, "folder_id": google id}]. Every move is re-verified live first.

    The whole batch is validated before anything changes. Each destination folder is checked live once,
    each file is fetched once, and the Drive calls run on a few threads; database work stays here."""
    if len(moves) > MAX_MOVES:
        raise TooManyMoves(f"At most {MAX_MOVES} moves per run")
    resolved, seen = [], set()
    for m in moves:
        if m["file_id"] in seen:
            continue  # the same file twice in one batch: the first destination wins
        seen.add(m["file_id"])
        f = db.scalar(select(DriveFile).where(
            DriveFile.account_id == account_id, DriveFile.google_file_id == m["file_id"]))
        dest = db.scalar(select(DriveFile).where(
            DriveFile.account_id == account_id, DriveFile.google_file_id == m["folder_id"]))
        if f is None or dest is None:
            raise LookupError("Unknown file or folder")  # nothing has been changed yet
        resolved.append((f, dest))

    ops = []
    for f, _dest in resolved:
        op = CleanupOperation.for_file(
            f, account_id=account_id, operation_type="move", status="pending",
            previous_parent_ids=f.parent_ids or ([f.parent_folder_id] if f.parent_folder_id else []),
        )
        db.add(op)
        ops.append(op)
    db.commit()

    with ThreadPoolExecutor(MOVE_WORKERS) as pool:
        folders = {dest.google_file_id for _f, dest in resolved if dest.mime_type == FOLDER}
        dest_problem = dict(zip(folders, pool.map(lambda gid: _check_destination(client, gid), folders)))
        work = []
        for op, (f, dest) in zip(ops, resolved):
            problem = "Destination is not a folder" if dest.mime_type != FOLDER else dest_problem[dest.google_file_id]
            if problem:
                _finish(db, op, "skipped", problem)
            else:
                work.append((op, f, (f.google_file_id, dest.google_file_id)))
        results = list(pool.map(lambda w: _move_one(client, *w[2]), work))
    for (op, f, (_gid, dest_gid)), (status, error, old_parents) in zip(work, results):
        if status == "completed":
            op.previous_parent_ids = old_parents
            f.parent_folder_id, f.parent_ids = dest_gid, [dest_gid]
        _finish(db, op, status, error)
    return ops


def _check_destination(client, folder_id: str) -> str | None:
    try:
        live = client.get_file(folder_id)
    except DriveError as err:
        return f"Could not check the destination folder ({err})"
    if live.get("trashed") or not live.get("ownedByMe", False):
        return "Destination folder is trashed or not yours"
    return None


def _move_one(client, file_id: str, dest_id: str) -> tuple[str, str | None, list | None]:
    """Runs on a worker thread: re-check the file live (one fetch), then move it."""
    try:
        live = client.get_file(file_id)
        problem = _check_file(live, dest_id)
        if problem:
            return "skipped", problem, None
        old_parents = live.get("parents") or []
        client.move_file(file_id, dest_id, old_parents)
        return "completed", None, old_parents
    except DriveError as err:
        log.warning("Move failed for %s: %s", file_id, err)
        return "failed", str(err), None


def _check_file(live: dict, dest_id: str) -> str | None:
    if live.get("trashed"):
        return "File is in Trash"
    if not live.get("ownedByMe", False):
        return "Not owned by you"
    if (live.get("capabilities") or {}).get("canMoveItemWithinDrive") is False:
        return "Drive does not allow moving this file"
    if dest_id in (live.get("parents") or []):
        return "Already in that folder"
    return None


def undo(db: Session, account_id: int, client, op_id: int) -> CleanupOperation:
    original = db.get(CleanupOperation, op_id)
    if original is None or original.account_id != account_id:
        raise LookupError("Operation not found")
    if original.operation_type != "move" or original.status != "completed":
        raise ValueError("Only completed moves can be undone")
    f = db.get(DriveFile, original.drive_file_id) if original.drive_file_id else None
    if f is None:
        raise ValueError("This file is no longer in Drive (it was permanently deleted)")
    previous = original.previous_parent_ids or []
    if not previous:
        raise ValueError("No previous location was recorded for this move")
    op = CleanupOperation.for_file(f, account_id=account_id, operation_type="unmove",
                                   status="pending", previous_parent_ids=[f.parent_folder_id])
    db.add(op)
    db.commit()
    try:
        live = client.get_file(f.google_file_id)
        client.move_file(f.google_file_id, previous[0], live.get("parents") or [], extra_add=previous[1:])
    except DriveError as err:
        _finish(db, op, "failed", str(err))
        return op
    f.parent_folder_id, f.parent_ids = previous[0], previous
    original.status = "undone"
    _finish(db, op, "completed", None)
    return op


def history(db: Session, account_id: int, limit: int = 200):
    return db.execute(
        select(CleanupOperation, DriveFile)
        .outerjoin(DriveFile, DriveFile.id == CleanupOperation.drive_file_id)  # keep rows whose file is gone
        .where(CleanupOperation.account_id == account_id, CleanupOperation.operation_type.in_(["move", "unmove"]))
        .order_by(CleanupOperation.id.desc())
        .limit(limit)
    ).all()

