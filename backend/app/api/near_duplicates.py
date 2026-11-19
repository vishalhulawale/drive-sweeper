import threading
from collections import OrderedDict

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import DriveFile
from app.repositories import scan_repository
from app.services import near_duplicate_service as nds
from app.services import oauth_service
from app.services.google_drive import DriveClient, DriveError
from app.workers import near_worker

router = APIRouter(prefix="/api/near-duplicates", tags=["near-duplicates"])


class NearStatus(BaseModel):
    running: bool
    last_error: str | None
    eligible: int
    hashed: int
    unhashable: int
    pending: int
    groups: int
    similar_files: int
    potential_savings: int


def _account(db: Session):
    account = oauth_service.get_account(db)
    if account is None:
        raise HTTPException(401, "No Google Drive account connected")
    return account


def get_client(db: Session = Depends(get_db)) -> DriveClient:
    """Dependency so tests can substitute a fake. Read-only scope is enough."""
    return DriveClient(oauth_service.credentials_for(_account(db)))


def _status(db: Session, account_id: int) -> NearStatus:
    s = near_worker.state()
    return NearStatus(running=bool(s["running"]), last_error=s["last_error"], **nds.status(db, account_id))


@router.get("/status", response_model=NearStatus)
def get_status(db: Session = Depends(get_db)):
    return _status(db, _account(db).id)


@router.post("/start", response_model=NearStatus, status_code=202)
def start(db: Session = Depends(get_db), client=Depends(get_client)):
    """Fetch small previews of your images and fingerprint them. Resumable; only reads previews."""
    account = _account(db)
    if scan_repository.get_active(db, account.id):
        raise HTTPException(409, "A full scan is running; try again when it finishes")
    if not near_worker.start(account.id, client):
        raise HTTPException(409, "Analysis is already running")
    return _status(db, account.id)


@router.post("/cancel", response_model=NearStatus)
def cancel(db: Session = Depends(get_db)):
    near_worker.cancel()
    return _status(db, _account(db).id)


@router.post("/detect", response_model=NearStatus)
def detect(db: Session = Depends(get_db)):
    """Re-group using the fingerprints already stored (fast; no Drive calls)."""
    account = _account(db)
    nds.detect(db, account.id)
    return _status(db, account.id)


# ---- previews ------------------------------------------------------------------------------------
# A review page loads dozens of previews at once. Building a Drive client per request cost a token refresh
# and a new connection each time (about 2 s per preview), so one client per account is reused: its
# credentials refresh about once an hour and each server thread keeps its own connection. Recently
# served previews (a few KB each) are kept in memory too.

_preview_lock = threading.Lock()
_preview_clients: dict[tuple, DriveClient] = {}
_previews: "OrderedDict[tuple, bytes]" = OrderedDict()
PREVIEW_CACHE_ITEMS = 2000  # about 10 MB at 200 px


def get_preview_client(db: Session = Depends(get_db)) -> DriveClient:
    """Dependency (tests substitute a fake). Reused per account; a reconnect makes a new one."""
    account = _account(db)
    key = (account.id, account.refresh_token, account.granted_scopes)
    with _preview_lock:
        client = _preview_clients.get(key)
        if client is None:
            for k in [k for k in _preview_clients if k[0] == account.id]:
                del _preview_clients[k]  # drop the client of an older connection of this account
            client = _preview_clients[key] = DriveClient(oauth_service.credentials_for(account))
    return client


def _cached_preview(key: tuple) -> bytes | None:
    with _preview_lock:
        data = _previews.get(key)
        if data is not None:
            _previews.move_to_end(key)
        return data


def _remember_preview(key: tuple, data: bytes) -> None:
    with _preview_lock:
        _previews[key] = data
        while len(_previews) > PREVIEW_CACHE_ITEMS:
            _previews.popitem(last=False)


@router.get("/thumbnail/{google_file_id}")
def thumbnail(google_file_id: str, size: int = Query(200, ge=32, le=400), db: Session = Depends(get_db),
              client=Depends(get_preview_client)):
    """A small preview of one of your files, for the review page. The original is not downloaded."""
    account = _account(db)
    f = db.scalar(select(DriveFile).where(DriveFile.account_id == account.id,
                                          DriveFile.google_file_id == google_file_id))
    if f is None or not f.mime_type.startswith("image/"):
        raise HTTPException(404, "Image not found")
    key = (account.id, google_file_id, f.md5_checksum, size)  # a changed file (new md5) is fetched again
    data = _cached_preview(key)
    if data is None:
        try:
            link = client.get_thumbnail_link(google_file_id)
            if not link:
                raise HTTPException(404, "No preview available")
            data = client.fetch_thumbnail(link, size)
        except DriveError as err:
            raise HTTPException(502, str(err))
        _remember_preview(key, data)
        creds = getattr(client, "_credentials", None)
        if creds is not None:
            oauth_service.persist_credentials(db, account, creds)  # saves a refreshed token, if any
    media = "image/png" if data[:4] == b"\x89PNG" else "image/jpeg"
    return Response(data, media_type=media, headers={"Cache-Control": "private, max-age=3600"})
