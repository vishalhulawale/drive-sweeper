from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.files import FileOut
from app.services import oauth_service, trash_service
from app.services.google_drive import DriveClient, DriveError

router = APIRouter(prefix="/api/trash", tags=["trash"])

DRIVE_TRASH_URL = "https://drive.google.com/drive/trash"


class TrashOverview(BaseModel):
    files: int
    bytes: int
    folders: int
    undated_files: int
    deleting_soon_files: int
    deleting_soon_bytes: int
    oldest_trashed_at: datetime | None
    next_auto_delete_at: datetime | None
    auto_delete_days: int
    drive_trash_url: str = DRIVE_TRASH_URL


class TrashItem(BaseModel):
    file: FileOut
    trashed_at: datetime | None
    auto_deletes_at: datetime | None
    trashed_by_app: bool


class TrashPage(BaseModel):
    items: list[TrashItem]
    total: int
    page: int
    page_size: int


class RefreshResult(BaseModel):
    seen: int
    updated: int


def _account(db: Session):
    account = oauth_service.get_account(db)
    if account is None:
        raise HTTPException(401, "No Google Drive account connected")
    return account


def get_client(db: Session = Depends(get_db)) -> DriveClient:
    """Dependency so tests can substitute a fake. Read-only scope is enough."""
    return DriveClient(oauth_service.credentials_for(_account(db)))


@router.get("/overview", response_model=TrashOverview)
def overview(db: Session = Depends(get_db)):
    return trash_service.overview(db, _account(db).id)


@router.get("/items", response_model=TrashPage)
def items(
    sort: Literal["size", "deletes", "name"] = "size",
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    total, rows = trash_service.items(db, _account(db).id, sort, page, page_size)
    return TrashPage(
        total=total, page=page, page_size=page_size,
        items=[
            TrashItem(file=FileOut.model_validate(f), trashed_at=f.trashed_time,
                      auto_deletes_at=trash_service.auto_delete_at(f.trashed_time), trashed_by_app=bool(by_app))
            for f, by_app in rows
        ],
    )


@router.post("/refresh-dates", response_model=RefreshResult)
def refresh_dates(db: Session = Depends(get_db), client=Depends(get_client)):
    """Fetch when each Trash item was trashed. Read-only; changes nothing in Drive."""
    try:
        return trash_service.refresh_dates(db, _account(db).id, client)
    except DriveError as err:
        raise HTTPException(502, str(err))
