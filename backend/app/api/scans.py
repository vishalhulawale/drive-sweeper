from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.repositories import scan_repository as scans
from app.schemas.scans import ScanOut
from app.services import oauth_service, sync_service
from app.workers import scan_worker

router = APIRouter(prefix="/api/scans", tags=["scans"])


def _account(db: Session):
    account = oauth_service.get_account(db)
    if account is None:
        raise HTTPException(401, "No Google Drive account connected")
    return account


def _job(db: Session, scan_id: int, account_id: int):
    job = scans.get(db, scan_id)
    if job is None or job.account_id != account_id:
        raise HTTPException(404, "Scan not found")
    return job


@router.post("", response_model=ScanOut, status_code=202)
def start_scan(db: Session = Depends(get_db)):
    account = _account(db)
    if scans.get_active(db, account.id):
        raise HTTPException(409, "A scan is already in progress")
    if sync_service.is_running():
        raise HTTPException(409, "A quick sync is running; try again in a few seconds")
    job = scans.create(db, account.id)
    scan_worker.start(job.id)
    return job


@router.get("", response_model=list[ScanOut])
def list_scans(db: Session = Depends(get_db)):
    return scans.list_for_account(db, _account(db).id)


@router.get("/{scan_id}", response_model=ScanOut)
def get_scan(scan_id: int, db: Session = Depends(get_db)):
    return _job(db, scan_id, _account(db).id)


@router.post("/{scan_id}/resume", response_model=ScanOut, status_code=202)
def resume_scan(scan_id: int, db: Session = Depends(get_db)):
    account = _account(db)
    job = _job(db, scan_id, account.id)
    if job.status not in scans.RESUMABLE_STATUSES:
        raise HTTPException(409, f"Scan is {job.status}; only failed, cancelled or interrupted scans can resume")
    if scans.get_active(db, account.id):
        raise HTTPException(409, "A scan is already in progress")
    if sync_service.is_running():
        raise HTTPException(409, "A quick sync is running; try again in a few seconds")
    job.status = "pending"
    db.commit()
    scan_worker.start(job.id)
    return job


@router.post("/{scan_id}/cancel", response_model=ScanOut)
def cancel_scan(scan_id: int, db: Session = Depends(get_db)):
    job = _job(db, scan_id, _account(db).id)
    if job.status not in scans.ACTIVE_STATUSES:
        raise HTTPException(409, f"Scan is {job.status}, nothing to cancel")
    job.status = "cancelled"
    db.commit()
    return job
