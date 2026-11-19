"""Manual cleanup: move user-selected duplicates to Drive Trash, record history, restore.

Safety rules (all enforced here, not just in the UI):
  * only files the user explicitly marked "trash" are touched; suggestions are never acted on;
  * every group must keep at least one copy, and that keeper is re-checked live against Drive;
  * each file is re-checked live (not trashed, owned, same MD5, canTrash) right before the change;
  * Trash only, recoverable. Nothing is ever permanently deleted;
  * every change is recorded in cleanup_operations so it can be undone.
"""
import logging
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
from datetime import datetime, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import CleanupOperation, DriveFile, DuplicateGroup, DuplicateGroupFile
from app.services import duplicate_detector
from app.services.google_drive import DriveError, NotFound

log = logging.getLogger(__name__)

MAX_BATCH = 10000  # runs happen in the background, so this only guards against absurd selections


class PlanChanged(Exception):
    """The selection no longer matches what the user confirmed."""


class TooManyFiles(Exception):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


def build_plan(db: Session, account_id: int) -> dict:
    rows = db.execute(
        select(DuplicateGroupFile, DuplicateGroup, DriveFile)
        .join(DuplicateGroup, DuplicateGroup.id == DuplicateGroupFile.duplicate_group_id)
        .join(DriveFile, DriveFile.id == DuplicateGroupFile.drive_file_id)
        .where(DuplicateGroup.account_id == account_id)
        .order_by(DuplicateGroup.id, DuplicateGroupFile.id)
    ).all()
    groups: dict[int, dict] = {}
    for entry, group, f in rows:
        g = groups.setdefault(group.id, {"group": group, "trash": [], "keep": []})
        (g["trash"] if entry.user_selected_action == "trash" else g["keep"]).append(f)

    # A file can sit in more than one group (an exact group and a similar-photos group). Decide
    # globally: a file marked Trash in ANY group is going, so it can never count as another group's
    # kept copy, and it is queued only once.
    doomed = {f.id for g in groups.values() for f in g["trash"]}
    items, blocked, queued = [], [], set()
    for gid, g in groups.items():
        if not g["trash"]:
            continue
        keepers = [f for f in g["keep"] if f.id not in doomed]
        if not keepers:
            blocked.append({"group_id": gid, "reason": "Every copy is marked Trash (here or in another group); "
                                                       "keep at least one."})
            continue
        for f in g["trash"]:
            if f.id in queued:
                continue
            queued.add(f.id)
            items.append({"group_id": gid, "file": f, "keeper": keepers[0], "md5": g["group"].content_hash})
    return {
        "items": items,
        "blocked": blocked,
        "count": len(items),
        "bytes": sum(i["file"].size or 0 for i in items),
    }


class RunInProgress(Exception):
    pass


def has_pending(db: Session, account_id: int) -> bool:
    return db.scalar(
        select(CleanupOperation.id)
        .where(CleanupOperation.account_id == account_id, CleanupOperation.status == "pending")
        .limit(1)
    ) is not None


def prepare(db: Session, account_id: int, expected_count: int) -> list[dict]:
    """Validate the confirmed plan and queue one pending operation per file. Touches nothing in Drive."""
    if has_pending(db, account_id):
        raise RunInProgress("A cleanup run is already in progress")
    plan = build_plan(db, account_id)
    if plan["count"] != expected_count:
        raise PlanChanged(f"Selection changed: expected {expected_count} files, now {plan['count']}")
    if plan["count"] > MAX_BATCH:
        raise TooManyFiles(f"At most {MAX_BATCH} files per cleanup run; {plan['count']} selected")

    jobs = []
    for item in plan["items"]:
        f: DriveFile = item["file"]
        op = CleanupOperation.for_file(
            f, account_id=account_id, operation_type="trash", status="pending",
            previous_parent_ids=f.parent_ids,
        )
        db.add(op)
        db.flush()
        jobs.append({
            "op_id": op.id, "file_id": f.id, "keeper_id": item["keeper"].id,
            "md5": f.md5_checksum, "keeper_md5": item["keeper"].md5_checksum, "group_id": item["group_id"],
            "sha256": f.sha256_checksum, "keeper_sha256": item["keeper"].sha256_checksum,
        })
    db.commit()
    return jobs


WORKERS = 10    # parallel Drive calls (~20 requests/s, far below the 12,000/min per-user quota); backoff handles throttling
IN_FLIGHT = 20  # files handed to workers but not finished; Cancel skips everything not yet handed over


def process(db: Session, account_id: int, client, jobs: list[dict]) -> list[CleanupOperation]:
    """Carry out queued operations. Safe to cancel: operations cancelled before they are started are skipped.

    Files stream through a thread pool (a new one starts as soon as a worker is free, no rounds). All
    database work stays on this thread (the session is not thread-safe), and workers only see plain
    values (ids, checksums), never ORM objects. Each group's kept copy is checked once, and every file
    of that group waits for that check before it is touched."""
    keeper_checks: dict[int, Future] = {}  # group_id -> future of the error message (None = verified)
    keeper_gids: dict[int, str] = {}       # group_id -> the keeper's Drive id
    running: dict[Future, tuple[CleanupOperation, DriveFile]] = {}
    ops: list[CleanupOperation] = []

    def collect() -> None:
        done, _ = wait(running, return_when=FIRST_COMPLETED)
        for fut in done:
            op, f = running.pop(fut)
            status, error, parents = fut.result()
            if status == "gone":  # deleted in Drive already: drop our stale row so it stops being listed
                _forget(db, account_id, f.google_file_id)
                status = "skipped"
            elif status == "completed":
                f.trashed = True
                f.trashed_time = _now()
                op.previous_parent_ids = parents or f.parent_ids
            _finish(db, op, status, error)

    with ThreadPoolExecutor(WORKERS) as pool:
        for job in jobs:
            while len(running) >= IN_FLIGHT:
                collect()
            op = db.get(CleanupOperation, job["op_id"])
            db.refresh(op)
            ops.append(op)
            if op.status != "pending":  # cancelled while queued
                continue
            gid = job["group_id"]
            if gid not in keeper_checks:
                keeper = db.get(DriveFile, job["keeper_id"])
                keeper_gids[gid] = keeper.google_file_id
                keeper_checks[gid] = pool.submit(
                    _check_keeper, client, keeper.google_file_id, job["keeper_md5"], job.get("keeper_sha256"))
            f = db.get(DriveFile, job["file_id"])
            # The keeper check was submitted first and the pool runs tasks in order, so it is already
            # running or done when a worker picks this up: waiting on it cannot deadlock.
            fut = pool.submit(_trash_after_keeper, keeper_checks[gid], client,
                              f.google_file_id, job["md5"], job.get("sha256"))
            running[fut] = (op, f)
        while running:
            collect()

    for gid, check in keeper_checks.items():
        if check.result() == KEEPER_GONE:
            _forget(db, account_id, keeper_gids[gid])
    db.commit()
    duplicate_detector.refresh_all(db, account_id)
    return ops


GONE = "No longer in Drive (deleted outside this app); removed from the list"
KEEPER_GONE = ("The copy you are keeping no longer exists in Drive; nothing was trashed in this group. "
               "It has been removed from the list, so choose another copy to keep.")


def _forget(db: Session, account_id: int, google_file_id: str) -> None:
    """Delete our row for a file Drive says does not exist, as sync does for removed files. Group
    memberships go with it (cascade) and cleanup history keeps its own copy of the name and size."""
    db.execute(delete(DriveFile).where(DriveFile.account_id == account_id,
                                       DriveFile.google_file_id == google_file_id))


def _trash_after_keeper(keeper_check: Future, client, google_file_id: str, md5: str, sha256: str | None):
    problem = keeper_check.result()
    if problem:
        return "skipped", problem, None
    return _trash_one(client, google_file_id, md5, sha256)


def _trash_one(client, google_file_id: str, md5: str, sha256: str | None) -> tuple[str, str | None, list | None]:
    """Runs on a worker thread: re-check the file live, then move it to Trash."""
    try:
        live = client.get_file(google_file_id)
        problem = _check_file(live, md5, sha256)
        if problem:
            return "skipped", problem, None
        client.set_trashed(google_file_id, True)
        return "completed", None, live.get("parents")
    except NotFound:
        return "gone", GONE, None
    except DriveError as err:
        log.warning("Trash failed for %s: %s", google_file_id, err)
        return "failed", str(err), None


def execute(db: Session, account_id: int, client, expected_count: int) -> list[CleanupOperation]:
    """Synchronous prepare + process (used by tests and small runs)."""
    return process(db, account_id, client, prepare(db, account_id, expected_count))


def status(db: Session, account_id: int) -> dict:
    """Progress of the current run: pending ops and how many were queued with them."""
    first = db.scalar(
        select(func.min(CleanupOperation.created_at))
        .where(CleanupOperation.account_id == account_id, CleanupOperation.status == "pending")
    )
    if first is None:
        return {"running": False, "total": 0, "remaining": 0}
    rows = db.execute(
        select(CleanupOperation.status, func.count())
        .where(CleanupOperation.account_id == account_id, CleanupOperation.operation_type == "trash",
               CleanupOperation.created_at >= first)
        .group_by(CleanupOperation.status)
    ).all()
    counts = dict(rows)
    return {"running": True, "total": sum(counts.values()), "remaining": counts.get("pending", 0)}


def cancel_pending(db: Session, account_id: int) -> int:
    ops = list(db.scalars(
        select(CleanupOperation).where(CleanupOperation.account_id == account_id, CleanupOperation.status == "pending")
    ))
    for op in ops:
        op.status = "cancelled"
        op.completed_at = _now()
    db.commit()
    return len(ops)


def mark_orphans_interrupted(db: Session) -> int:
    """At startup: pending operations whose worker died are failed so a new run can start."""
    ops = list(db.scalars(select(CleanupOperation).where(CleanupOperation.status == "pending")))
    for op in ops:
        op.status = "failed"
        op.error_message = "Interrupted by a server restart; run Cleanup again."
        op.completed_at = _now()
    db.commit()
    return len(ops)


def _changed(live: dict, md5: str, sha256: str | None) -> bool:
    """Contents differ from what was scanned. SHA-256 is compared whenever both sides have one."""
    if live.get("md5Checksum") != md5:
        return True
    return bool(sha256 and live.get("sha256Checksum") and live["sha256Checksum"] != sha256)


def _check_keeper(client, keeper_google_id: str, md5: str, sha256: str | None = None) -> str | None:
    try:
        live = client.get_file(keeper_google_id)
    except NotFound:
        return KEEPER_GONE
    except DriveError as err:
        return f"Could not verify the copy you are keeping ({err}); nothing was trashed in this group."
    if live.get("trashed") or _changed(live, md5, sha256):
        return "The copy you are keeping is no longer available or has changed; nothing was trashed in this group."
    return None


def _check_file(live: dict, md5: str, sha256: str | None = None) -> str | None:
    if live.get("trashed"):
        return "Already in Trash"
    if not live.get("ownedByMe", False):
        return "Not owned by you"
    if _changed(live, md5, sha256):
        return "File changed since the scan; rescan first"
    if (live.get("capabilities") or {}).get("canTrash") is False:
        return "Drive does not allow trashing this file"
    return None


def _finish(db: Session, op: CleanupOperation, status: str, error: str | None) -> None:
    op.status = status
    op.error_message = error
    op.completed_at = _now()
    db.commit()


def restore(db: Session, account_id: int, client, op_id: int) -> CleanupOperation:
    original = db.get(CleanupOperation, op_id)
    if original is None or original.account_id != account_id:
        raise LookupError("Operation not found")
    if original.operation_type != "trash" or original.status != "completed":
        raise ValueError("Only completed trash operations can be restored")
    f = db.get(DriveFile, original.drive_file_id) if original.drive_file_id else None
    if f is None:
        raise ValueError("This file is no longer in Drive (it was permanently deleted, e.g. Trash was emptied)")
    op = CleanupOperation.for_file(f, account_id=account_id, operation_type="restore", status="pending")
    db.add(op)
    db.commit()
    try:
        client.set_trashed(f.google_file_id, False)
    except DriveError as err:
        _finish(db, op, "failed", str(err))
        return op
    f.trashed = False
    f.trashed_time = None
    original.status = "restored"
    _finish(db, op, "completed", None)
    duplicate_detector.refresh_all(db, account_id)
    return op


def history(db: Session, account_id: int, limit: int = 200):
    return db.execute(
        select(CleanupOperation, DriveFile)
        .outerjoin(DriveFile, DriveFile.id == CleanupOperation.drive_file_id)  # keep rows whose file is gone
        .where(CleanupOperation.account_id == account_id)
        .order_by(CleanupOperation.id.desc())
        .limit(limit)
    ).all()
