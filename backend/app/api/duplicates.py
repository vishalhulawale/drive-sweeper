from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import DriveFile, DuplicateGroup, DuplicateGroupFile
from app.schemas.duplicates import (
    ApplySuggestionsIn, DuplicateFileOut, DuplicateGroupOut, DuplicateGroupPage, DuplicateSummary, SelectionIn,
)
from app.schemas.files import FileOut
from app.services import duplicate_detector, oauth_service

router = APIRouter(prefix="/api/duplicates", tags=["duplicates"])


def _account_id(db: Session) -> int:
    account = oauth_service.get_account(db)
    if account is None:
        raise HTTPException(401, "No Google Drive account connected")
    return account.id


def _file_out(f: DriveFile) -> FileOut:
    return FileOut.model_validate(f)


def _groups_out(db: Session, groups: list[DuplicateGroup]) -> list[DuplicateGroupOut]:
    rows = db.execute(
        select(DuplicateGroupFile, DriveFile)
        .join(DriveFile, DriveFile.id == DuplicateGroupFile.drive_file_id)
        .where(DuplicateGroupFile.duplicate_group_id.in_([g.id for g in groups]))
        .order_by(DuplicateGroupFile.id)
    ).all()
    by_group: dict[int, list[DuplicateFileOut]] = {}
    for entry, f in rows:
        by_group.setdefault(entry.duplicate_group_id, []).append(
            DuplicateFileOut(
                entry_id=entry.id,
                file=_file_out(f),
                recommended_action=entry.recommended_action,
                user_selected_action=entry.user_selected_action,
            )
        )
    return [
        DuplicateGroupOut(
            id=g.id,
            detection_type=g.detection_type,
            content_hash=g.content_hash,
            file_count=g.file_count,
            file_size=g.total_size // g.file_count,
            potential_savings=g.potential_savings,
            files=by_group.get(g.id, []),
        )
        for g in groups
    ]


@router.post("/detect", response_model=DuplicateSummary)
def detect(db: Session = Depends(get_db)):
    return duplicate_detector.rebuild(db, _account_id(db))


@router.get("/summary", response_model=DuplicateSummary)
def summary(db: Session = Depends(get_db)):
    return duplicate_detector.summary(db, _account_id(db))


@router.get("", response_model=DuplicateGroupPage)
def list_groups(
    kind: Literal["exact", "near"] = "exact",
    sort: Literal["savings", "count", "size"] = "savings",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    acc = _account_id(db)
    order = {
        "savings": DuplicateGroup.potential_savings.desc(),
        "count": DuplicateGroup.file_count.desc(),
        "size": (DuplicateGroup.total_size / DuplicateGroup.file_count).desc(),
    }[sort]
    total = db.scalar(select(func.count()).select_from(DuplicateGroup).where(
        DuplicateGroup.account_id == acc, DuplicateGroup.detection_type == kind)) or 0
    groups = list(
        db.scalars(
            select(DuplicateGroup)
            .where(DuplicateGroup.account_id == acc, DuplicateGroup.detection_type == kind)
            .order_by(order, DuplicateGroup.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    items = _groups_out(db, groups) if groups else []
    return DuplicateGroupPage(items=items, total=total, page=page, page_size=page_size)


@router.post("/apply-suggestions", response_model=DuplicateSummary)
def apply_suggestions(body: ApplySuggestionsIn, db: Session = Depends(get_db)):
    """Record the suggested keep/trash action as the user's choice for the given groups.

    Records choices only; nothing is changed in Drive."""
    acc = _account_id(db)
    if not body.all_groups and not body.group_ids:
        raise HTTPException(422, "Provide group_ids or all_groups")
    stmt = (
        select(DuplicateGroupFile)
        .join(DuplicateGroup, DuplicateGroup.id == DuplicateGroupFile.duplicate_group_id)
        .where(DuplicateGroup.account_id == acc, DuplicateGroup.detection_type == body.kind)
    )
    if not body.all_groups:
        stmt = stmt.where(DuplicateGroup.id.in_(body.group_ids))
    entries = db.scalars(stmt)
    for e in entries:
        e.user_selected_action = e.recommended_action
    db.commit()
    return duplicate_detector.summary(db, acc)


@router.get("/{group_id}", response_model=DuplicateGroupOut)
def get_group(group_id: int, db: Session = Depends(get_db)):
    g = db.get(DuplicateGroup, group_id)
    if g is None or g.account_id != _account_id(db):
        raise HTTPException(404, "Duplicate group not found")
    return _groups_out(db, [g])[0]


@router.put("/entries/{entry_id}/selection", response_model=DuplicateFileOut)
def set_selection(entry_id: int, body: SelectionIn, db: Session = Depends(get_db)):
    acc = _account_id(db)
    entry = db.get(DuplicateGroupFile, entry_id)
    group = db.get(DuplicateGroup, entry.duplicate_group_id) if entry else None
    if entry is None or group is None or group.account_id != acc:
        raise HTTPException(404, "Duplicate entry not found")
    entry.user_selected_action = body.action
    db.commit()
    return DuplicateFileOut(
        entry_id=entry.id,
        file=_file_out(db.get(DriveFile, entry.drive_file_id)),
        recommended_action=entry.recommended_action,
        user_selected_action=entry.user_selected_action,
    )
