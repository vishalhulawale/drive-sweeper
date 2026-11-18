"""Runs scans in a background thread with its own DB session.

A separate process/Celery worker is the planned future step; the job table is the contract, so
swapping this out later does not change the API.
"""
import logging
import threading

from app.core.database import SessionLocal
from app.models import DriveAccount, ScanJob
from app.services import file_scanner, oauth_service
from app.services.google_drive import DriveClient

log = logging.getLogger(__name__)
_running: set[int] = set()
_lock = threading.Lock()


def is_running(job_id: int) -> bool:
    with _lock:
        return job_id in _running


def run_job(job_id: int) -> None:
    db = SessionLocal()
    try:
        job = db.get(ScanJob, job_id)
        account = db.get(DriveAccount, job.account_id) if job else None
        if job is None or account is None:
            return
        creds = oauth_service.credentials_for(account)
        file_scanner.run_scan(db, DriveClient(creds), job)
        oauth_service.persist_credentials(db, account, creds)
    except Exception:
        log.exception("Scan worker crashed for job %s", job_id)
        db.rollback()
        job = db.get(ScanJob, job_id)
        if job and job.status in ("pending", "running"):
            job.status = "failed"
            job.error_message = "Worker crashed; see server logs."
            db.commit()
    finally:
        db.close()
        with _lock:
            _running.discard(job_id)


def start(job_id: int) -> None:
    with _lock:
        if job_id in _running:
            return
        _running.add(job_id)
    threading.Thread(target=run_job, args=(job_id,), name=f"scan-{job_id}", daemon=True).start()
