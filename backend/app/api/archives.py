from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.cleanup import get_drive_client
from app.core.database import get_db
from app.schemas.archives import ArchiveItem, ArchiveList, ArchiveStatus, ExtractIn, ExtractionOut
from app.schemas.files import FileOut
from app.services import archive_service, oauth_service
from app.services.archive_reader import rar_supported
from app.workers import archive_worker

router = APIRouter(prefix="/api/archives", tags=["archives"])


def _account(db: Session):
    account = oauth_service.get_account(db)
    if account is None:
        raise HTTPException(401, "No Google Drive account connected")
    return account


def _status(db: Session, account_id: int) -> ArchiveStatus:
    run = archive_service.current_run(db, account_id)
    return ArchiveStatus(running=any(e.status in ("pending", "running") for e in run),
                         extractions=[ExtractionOut.model_validate(e) for e in run])


@router.get("", response_model=ArchiveList)
def list_archives(owned: bool = True, db: Session = Depends(get_db)):
    """Zip, rar and tar archives with the folder each would be extracted into. owned=false also lists
    archives shared with you (shown for reference; only your own can be extracted)."""
    items = archive_service.list_archives(db, _account(db).id, owned_only=owned)
    return ArchiveList(
        items=[ArchiveItem(file_id=i["file"].id, file=FileOut.model_validate(i["file"]), kind=i["kind"],
                           folder_name=i["folder_name"], parent_name=i["parent_name"],
                           last=ExtractionOut.model_validate(i["last"]) if i["last"] else None) for i in items],
        rar_supported=rar_supported(), workers=archive_service.ARCHIVE_WORKERS,
    )


@router.post("/extract", response_model=ArchiveStatus, status_code=202)
def extract(body: ExtractIn, db: Session = Depends(get_db), client=Depends(get_drive_client)):
    """Queue the chosen archives and extract them in the background; poll /status for progress."""
    account = _account(db)
    try:
        ids = archive_service.prepare(db, account.id, body.file_ids)
    except archive_service.RunInProgress as err:
        raise HTTPException(409, str(err))
    except ValueError as err:
        raise HTTPException(400, str(err))
    archive_worker.start(account.id, client, ids)
    return _status(db, account.id)


@router.get("/status", response_model=ArchiveStatus)
def status(db: Session = Depends(get_db)):
    return _status(db, _account(db).id)


@router.post("/cancel", response_model=ArchiveStatus)
def cancel(db: Session = Depends(get_db)):
    """Skip queued archives and stop running ones after the files they are uploading. Folders already
    created are kept, and extracting the archive again continues where it stopped."""
    account = _account(db)
    archive_worker.cancel(account.id)
    archive_service.cancel_pending(db, account.id)
    return _status(db, account.id)


@router.get("/history", response_model=list[ExtractionOut])
def history(db: Session = Depends(get_db)):
    return archive_service.history(db, _account(db).id)
