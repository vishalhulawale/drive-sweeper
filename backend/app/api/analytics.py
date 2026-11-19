from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.analytics import FolderTree, FolderUsage, LargestFiles, Overview, YearUsage
from app.schemas.files import FileOut
from app.services import analytics_service as svc
from app.services import oauth_service

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _account_id(db: Session) -> int:
    account = oauth_service.get_account(db)
    if account is None:
        raise HTTPException(401, "No Google Drive account connected")
    return account.id


@router.get("/overview", response_model=Overview)
def overview(db: Session = Depends(get_db)):
    return svc.overview(db, _account_id(db))


@router.get("/by-year", response_model=list[YearUsage])
def by_year(db: Session = Depends(get_db)):
    return svc.by_year(db, _account_id(db))


@router.get("/largest-files", response_model=LargestFiles)
def largest_files(limit: int = Query(25, ge=1, le=200), db: Session = Depends(get_db)):
    return LargestFiles(items=[FileOut.model_validate(f) for f in svc.largest_files(db, _account_id(db), limit)])


@router.get("/largest-folders", response_model=list[FolderUsage])
def largest_folders(limit: int = Query(25, ge=1, le=200), db: Session = Depends(get_db)):
    return svc.largest_folders(db, _account_id(db), limit)


@router.get("/folder-tree", response_model=FolderTree)
def folder_tree(folder: str | None = None, db: Session = Depends(get_db)):
    """One level of the folder tree with total sizes, for the storage treemap. Omit `folder` for the top level."""
    try:
        return svc.folder_tree(db, _account_id(db), folder)
    except KeyError:
        raise HTTPException(404, "Folder not found")
