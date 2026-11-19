"""Manual cleanup: move user-selected duplicates to Drive Trash, record history, restore.

Safety rules (all enforced here, not just in the UI):
  * only files the user explicitly marked "trash" are touched; suggestions are never acted on;
  * every group must keep at least one copy, and that keeper is re-checked live against Drive;
  * each file is re-checked live (not trashed, owned, same MD5, canTrash) right before the change;
  * Trash only, recoverable. Nothing is ever permanently deleted;
  * every change is recorded in cleanup_operations so it can be undone.
"""
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CleanupOperation, DriveFile, DuplicateGroup, DuplicateGroupFile
from app.services import duplicate_detector
from app.services.google_drive import DriveError

log = logging.getLogger(__name__)

MAX_BATCH = 100


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

    items, blocked = [], []
    for gid, g in groups.items():
        if not g["trash"]:
            continue
        if not g["keep"]:
            blocked.append({"group_id": gid, "reason": "Every copy is marked Trash; keep at least one."})
            continue
        for f in g["trash"]:
            items.append({"group_id": gid, "file": f, "keeper": g["keep"][0], "md5": g["group"].content_hash})
    return {
        "items": items,
        "blocked": blocked,
        "count": len(items),
        "bytes": sum(i["file"].size or 0 for i in items),
    }


def execute(db: Session, account_id: int, client, expected_count: int) -> list[CleanupOperation]:
    plan = build_plan(db, account_id)
    if plan["count"] != expected_count:
        raise PlanChanged(f"Selection changed: expected {expected_count} files, now {plan['count']}")
    if plan["count"] > MAX_BATCH:
        raise TooManyFiles(f"At most {MAX_BATCH} files per cleanup run; {plan['count']} selected")

    keeper_ok: dict[int, str | None] = {}  # group_id -> error message (None = keeper verified)
    ops: list[CleanupOperation] = []

    for item in plan["items"]:
        f: DriveFile = item["file"]
        op = CleanupOperation(
            account_id=account_id, drive_file_id=f.id, operation_type="trash", status="pending",
            previous_parent_ids=f.parent_ids,
        )
        db.add(op)
        db.commit()
        ops.append(op)
        try:
            gid = item["group_id"]
            if gid not in keeper_ok:
                keeper_ok[gid] = _check_keeper(client, item["keeper"], item["md5"])
            if keeper_ok[gid]:
                _finish(db, op, "skipped", keeper_ok[gid])
                continue
            live = client.get_file(f.google_file_id)
            problem = _check_file(live, item["md5"])
            if problem:
                _finish(db, op, "skipped", problem)
                continue
            client.set_trashed(f.google_file_id, True)
            f.trashed = True
            op.previous_parent_ids = live.get("parents") or f.parent_ids
            _finish(db, op, "completed", None)
        except DriveError as err:
            log.warning("Trash failed for %s: %s", f.google_file_id, err)
            _finish(db, op, "failed", str(err))

    duplicate_detector.rebuild(db, account_id)
    return ops


def _check_keeper(client, keeper: DriveFile, md5: str) -> str | None:
    try:
        live = client.get_file(keeper.google_file_id)
    except DriveError as err:
        return f"Could not verify the copy you are keeping ({err}); nothing was trashed in this group."
    if live.get("trashed") or live.get("md5Checksum") != md5:
        return "The copy you are keeping is no longer available or has changed; nothing was trashed in this group."
    return None


def _check_file(live: dict, md5: str) -> str | None:
    if live.get("trashed"):
        return "Already in Trash"
    if not live.get("ownedByMe", False):
        return "Not owned by you"
    if live.get("md5Checksum") != md5:
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
    f = db.get(DriveFile, original.drive_file_id)
    op = CleanupOperation(
        account_id=account_id, drive_file_id=original.drive_file_id, operation_type="restore", status="pending"
    )
    db.add(op)
    db.commit()
    try:
        client.set_trashed(f.google_file_id, False)
    except DriveError as err:
        _finish(db, op, "failed", str(err))
        return op
    f.trashed = False
    original.status = "restored"
    _finish(db, op, "completed", None)
    duplicate_detector.rebuild(db, account_id)
    return op


def history(db: Session, account_id: int, limit: int = 100):
    return db.execute(
        select(CleanupOperation, DriveFile)
        .join(DriveFile, DriveFile.id == CleanupOperation.drive_file_id)
        .where(CleanupOperation.account_id == account_id)
        .order_by(CleanupOperation.id.desc())
        .limit(limit)
    ).all()
