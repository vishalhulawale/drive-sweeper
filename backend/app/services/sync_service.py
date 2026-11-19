"""Incremental sync from the Drive Changes feed.

A complete scan stores a bookmark (taken before it started). Sync replays everything that changed
since that bookmark into the local inventory, then stores the new bookmark. Read-only towards Drive.

Each page of changes and the bookmark that follows it are saved in ONE transaction, so an interrupted
sync resumes from the last saved page and never skips changes. Applying a change is idempotent.
"""
import logging
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import DriveFile, SyncState
from app.repositories import drive_file_repository as files_repo
from app.repositories import scan_repository
from app.services import duplicate_detector
from app.services.file_scanner import parse_file
from app.services.google_drive import InvalidPageToken

log = logging.getLogger(__name__)


class SyncUnavailable(Exception):
    """Quick sync cannot run; a full scan is needed first (no baseline, or Google expired it)."""


class ScanActive(Exception):
    pass


def get_state(db: Session, account_id: int) -> SyncState | None:
    return db.scalar(select(SyncState).where(SyncState.account_id == account_id))


def status(db: Session, account_id: int) -> dict:
    state = get_state(db, account_id)
    return {
        "available": bool(state and state.changes_page_token),
        "last_sync_at": state.last_sync_at if state else None,
    }


def sync(db: Session, account_id: int, client) -> dict:
    if scan_repository.get_active(db, account_id):
        raise ScanActive("A full scan is running; quick sync is not needed until it finishes")
    state = get_state(db, account_id)
    if state is None or not state.changes_page_token:
        raise SyncUnavailable("Run one full scan first; it sets the starting point for quick sync.")

    token = state.changes_page_token
    updated = removed = 0
    state.sync_status = "running"
    db.commit()
    try:
        while True:
            try:
                changes, next_token, new_start = client.list_changes_page(token)
            except InvalidPageToken as err:
                state.changes_page_token = None
                state.sync_status = "idle"
                db.commit()
                raise SyncUnavailable("Google no longer accepts the saved starting point; run a full scan.") from err

            u, r = _apply(db, account_id, changes)
            updated += u
            removed += r
            token = next_token or new_start
            state.changes_page_token = token  # bookmark advances with the data, same transaction
            if next_token is None:
                state.last_sync_at = datetime.now(timezone.utc)
                state.sync_status = "idle"
            db.commit()
            if next_token is None:
                break
    except SyncUnavailable:
        raise
    except Exception:
        db.rollback()
        state = get_state(db, account_id)
        state.sync_status = "failed"
        db.commit()
        raise

    if updated or removed:
        duplicate_detector.rebuild(db, account_id)  # keeps the user's keep/trash choices
    log.info("Sync: %d updated, %d removed", updated, removed)
    return {"updated": updated, "removed": removed, "last_sync_at": get_state(db, account_id).last_sync_at}


def _apply(db: Session, account_id: int, changes: list[dict]) -> tuple[int, int]:
    """Collapse the page to the final state per file (later changes win), then write it."""
    final: dict[str, dict | None] = {}
    for c in changes:
        fid = c.get("fileId")
        if not fid:
            continue
        if c.get("removed") or not c.get("file"):
            final[fid] = None
        else:
            final[fid] = c["file"]

    now = datetime.now(timezone.utc)
    rows = [parse_file(f, now) for f in final.values() if f is not None]
    gone = [fid for fid, f in final.items() if f is None]
    files_repo.upsert_files(db, account_id, rows)
    if gone:
        db.execute(delete(DriveFile).where(DriveFile.account_id == account_id, DriveFile.google_file_id.in_(gone)))
    return len(rows), len(gone)



