from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.repositories import query_files as qf
from app.schemas.files import FileOut, FilePage, InventorySummary, TreeNode
from app.services import oauth_service

router = APIRouter(prefix="/api/files", tags=["files"])


def _account_id(db: Session) -> int:
    account = oauth_service.get_account(db)
    if account is None:
        raise HTTPException(401, "No Google Drive account connected")
    return account.id


def _out(f) -> FileOut:
    out = FileOut.model_validate(f)
    out.is_folder = f.mime_type == qf.FOLDER
    return out


@router.get("", response_model=FilePage)
def list_files(
    parent: str | None = Query(None, description="Drive folder id, or 'root' for the top level"),
    q: str | None = Query(None, max_length=200, description="Name search (ignores parent)"),
    kind: Literal["folder", "file", "doc"] | None = None,
    trashed: bool = False,
    sort: Literal["name", "size", "modified", "created"] = "name",
    order: Literal["asc", "desc"] = "asc",
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    rows, total = qf.list_files(
        db, _account_id(db), parent=parent, q=q, kind=kind, trashed=trashed,
        sort=sort, order=order, page=page, page_size=page_size,
    )
    return FilePage(items=[_out(r) for r in rows], total=total, page=page, page_size=page_size)


@router.get("/summary", response_model=InventorySummary)
def inventory_summary(db: Session = Depends(get_db)):
    return qf.summary(db, _account_id(db))


@router.get("/tree", response_model=list[TreeNode])
def tree(parent: str | None = None, db: Session = Depends(get_db)):
    rows = qf.folder_tree(db, _account_id(db), parent)
    return [TreeNode(google_file_id=r[0], name=r[1], child_folder_count=r[2]) for r in rows]


@router.get("/{file_id}", response_model=FileOut)
def get_file(file_id: str, db: Session = Depends(get_db)):
    f = qf.get_by_google_id(db, _account_id(db), file_id)
    if f is None:
        raise HTTPException(404, "File not found")
    return _out(f)


@router.get("/{file_id}/children", response_model=FilePage)
def children(
    file_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    acc = _account_id(db)
    if qf.get_by_google_id(db, acc, file_id) is None:
        raise HTTPException(404, "Folder not found")
    rows, total = qf.list_files(db, acc, parent=file_id, page=page, page_size=page_size)
    return FilePage(items=[_out(r) for r in rows], total=total, page=page, page_size=page_size)


@router.get("/{file_id}/path", response_model=list[TreeNode])
def path(file_id: str, db: Session = Depends(get_db)):
    chain = qf.breadcrumb(db, _account_id(db), file_id)
    return [TreeNode(google_file_id=f.google_file_id, name=f.name, child_folder_count=0) for f in chain]
