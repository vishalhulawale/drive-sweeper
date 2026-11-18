"""Resumable, idempotent metadata scan.

Each page is upserted and the page-token checkpoint saved in ONE transaction, so a crash never
leaves a checkpoint that points past unsaved data. The scan only reads metadata.
"""
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import ScanJob
from app.repositories import drive_file_repository as files_repo
from app.services.google_drive import DriveClient, DriveError, InvalidPageToken

log = logging.getLogger(__name__)

FOLDER_MIME = "application/vnd.google-apps.folder"
SHORTCUT_MIME = "application/vnd.google-apps.shortcut"
GOOGLE_APPS_PREFIX = "application/vnd.google-apps."
MAX_LISTING_RESTARTS = 3


def _parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def parse_file(raw: dict, scanned_at: datetime) -> dict:
    """Map a Drive API file resource to a drive_files row. Google-native docs have no size/MD5."""
    parents = raw.get("parents") or []
    mime = raw.get("mimeType", "")
    is_shortcut = mime == SHORTCUT_MIME
    return {
        "google_file_id": raw["id"],
        "name": raw.get("name", ""),
        "mime_type": mime,
        "size": int(raw["size"]) if raw.get("size") is not None else None,
        "md5_checksum": raw.get("md5Checksum"),
        "parent_folder_id": parents[0] if parents else None,
        "parent_ids": parents,
        "created_time": _parse_time(raw.get("createdTime")),
        "modified_time": _parse_time(raw.get("modifiedTime")),
        "web_view_link": raw.get("webViewLink"),
        "trashed": bool(raw.get("trashed", False)),
        "is_owned_by_user": bool(raw.get("ownedByMe", False)),
        "is_shortcut": is_shortcut,
        "shortcut_target_id": (raw.get("shortcutDetails") or {}).get("targetId") if is_shortcut else None,
        "last_scanned_at": scanned_at,
    }


def _is_cancelled(db: Session, job: ScanJob) -> bool:
    db.refresh(job)
    return job.status == "cancelled"


def run_scan(db: Session, client: DriveClient, job: ScanJob) -> ScanJob:
    """Run (or resume) a scan job to completion, cancellation, or failure."""
    job.status = "running"
    if job.next_page_token is None:
        # Fresh scan: stamp start with the app clock (same clock as last_scanned_at) so the stale
        # sweep never depends on DB-server clock drift. Resumed scans keep the original start.
        job.started_at = datetime.now(timezone.utc)
    job.error_message = None
    job.completed_at = None
    db.commit()

    restarts = 0
    try:
        while True:
            if _is_cancelled(db, job):
                log.info("Scan %s cancelled", job.id)
                return job

            try:
                raw_files, next_token = client.list_files_page(job.next_page_token)
            except InvalidPageToken:
                restarts += 1
                if restarts > MAX_LISTING_RESTARTS:
                    raise DriveError("Page token kept expiring; giving up after restarting the listing")
                # Expired checkpoint: restart the listing. Upserts are idempotent, so this is safe.
                log.warning("Scan %s: page token invalid, restarting listing", job.id)
                job.next_page_token = None
                job.processed_files = 0
                job.started_at = datetime.now(timezone.utc)
                db.commit()
                continue

            scanned_at = datetime.now(timezone.utc)
            rows = [parse_file(f, scanned_at) for f in raw_files]
            files_repo.upsert_files(db, job.account_id, rows)
            job.processed_files += len(rows)
            job.next_page_token = next_token
            db.commit()  # page + checkpoint together
            log.info("Scan %s: %d files processed", job.id, job.processed_files)

            if next_token is None:
                break

        removed = files_repo.delete_not_seen_since(db, job.account_id, job.started_at)
        job.total_files = job.processed_files
        job.status = "completed"
        job.completed_at = datetime.now(timezone.utc)
        db.commit()
        log.info("Scan %s completed: %d files, %d stale rows removed", job.id, job.processed_files, removed)
    except Exception as exc:
        db.rollback()
        job = db.get(ScanJob, job.id)
        if job.status != "cancelled":
            job.status = "failed"
            job.error_message = (str(exc) if isinstance(exc, DriveError) else f"{type(exc).__name__}: {exc}")[:2000]
            job.completed_at = datetime.now(timezone.utc)
            db.commit()
        log.exception("Scan %s failed", job.id)
    return job
