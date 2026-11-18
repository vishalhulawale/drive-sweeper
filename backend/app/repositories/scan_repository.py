from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ScanJob

ACTIVE_STATUSES = ("pending", "running")
RESUMABLE_STATUSES = ("failed", "cancelled", "interrupted")


def create(db: Session, account_id: int) -> ScanJob:
    job = ScanJob(account_id=account_id, status="pending", processed_files=0)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def get(db: Session, scan_id: int) -> ScanJob | None:
    return db.get(ScanJob, scan_id)


def list_for_account(db: Session, account_id: int, limit: int = 50) -> list[ScanJob]:
    stmt = select(ScanJob).where(ScanJob.account_id == account_id).order_by(ScanJob.id.desc()).limit(limit)
    return list(db.scalars(stmt))


def get_active(db: Session, account_id: int) -> ScanJob | None:
    stmt = select(ScanJob).where(ScanJob.account_id == account_id, ScanJob.status.in_(ACTIVE_STATUSES))
    return db.scalar(stmt.limit(1))


def mark_running_as_interrupted(db: Session) -> int:
    """Called at startup: any job left 'running'/'pending' lost its worker when the process died."""
    jobs = list(db.scalars(select(ScanJob).where(ScanJob.status.in_(ACTIVE_STATUSES))))
    for job in jobs:
        job.status = "interrupted"
        job.error_message = "Scan interrupted by server restart; resume to continue."
    db.commit()
    return len(jobs)
