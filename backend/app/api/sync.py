from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services import oauth_service, sync_service
from app.services.google_drive import DriveClient, DriveError

router = APIRouter(prefix="/api/sync", tags=["sync"])


class SyncStatus(BaseModel):
    available: bool
    last_sync_at: datetime | None


class SyncResult(BaseModel):
    updated: int
    removed: int
    last_sync_at: datetime | None


def _account(db: Session):
    account = oauth_service.get_account(db)
    if account is None:
        raise HTTPException(401, "No Google Drive account connected")
    return account


def get_client(db: Session = Depends(get_db)) -> DriveClient:
    """Dependency so tests can substitute a fake client. Read-only scope is enough for sync."""
    return DriveClient(oauth_service.credentials_for(_account(db)))


@router.get("/status", response_model=SyncStatus)
def sync_status(db: Session = Depends(get_db)):
    return sync_service.status(db, _account(db).id)


@router.post("", response_model=SyncResult)
def run_sync(db: Session = Depends(get_db), client=Depends(get_client)):
    """Pull the changes made in Drive since the last scan or sync. Usually takes a few seconds."""
    try:
        return sync_service.sync(db, _account(db).id, client)
    except sync_service.ScanActive as err:
        raise HTTPException(409, str(err))
    except sync_service.SyncUnavailable as err:
        raise HTTPException(409, str(err))
    except DriveError as err:
        raise HTTPException(502, str(err))
