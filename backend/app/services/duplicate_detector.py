"""Exact duplicate detection from Drive metadata (MD5 + size). Read-only: never touches Drive."""
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import DriveFile, DuplicateGroup, DuplicateGroupFile

GAPPS = "application/vnd.google-apps."


def _eligible(account_id: int):
    """Files we can reasonably call duplicates: live, owned, real binary files with a checksum."""
    return (
        DriveFile.account_id == account_id,
        DriveFile.trashed.is_(False),
        DriveFile.is_owned_by_user.is_(True),
        DriveFile.is_shortcut.is_(False),
        ~DriveFile.mime_type.like(GAPPS + "%"),
        DriveFile.md5_checksum.is_not(None),
        DriveFile.size.is_not(None),
        DriveFile.size > 0,
    )


def _keeper_key(f: DriveFile):
    # Keep the oldest copy; ties broken by shorter name, then id for determinism.
    return (f.created_time is None, f.created_time, len(f.name), f.id)


def rebuild(db: Session, account_id: int) -> dict:
    """Recompute all duplicate groups for the account, preserving the user's earlier choices."""
    old = {
        row.drive_file_id: row.user_selected_action
        for row in db.execute(
            select(DuplicateGroupFile.drive_file_id, DuplicateGroupFile.user_selected_action)
            .join(DuplicateGroup, DuplicateGroup.id == DuplicateGroupFile.duplicate_group_id)
            .where(DuplicateGroup.account_id == account_id, DuplicateGroupFile.user_selected_action.is_not(None))
        )
    }
    db.execute(delete(DuplicateGroup).where(DuplicateGroup.account_id == account_id))

    keys = db.execute(
        select(DriveFile.md5_checksum, DriveFile.size)
        .where(*_eligible(account_id))
        .group_by(DriveFile.md5_checksum, DriveFile.size)
        .having(func.count() > 1)
    ).all()

    for md5, size in keys:
        files = list(
            db.scalars(
                select(DriveFile).where(*_eligible(account_id), DriveFile.md5_checksum == md5, DriveFile.size == size)
            )
        )
        files.sort(key=_keeper_key)
        group = DuplicateGroup(
            account_id=account_id,
            detection_type="exact",
            hash_algorithm="md5",
            content_hash=md5,
            file_count=len(files),
            total_size=size * len(files),
            potential_savings=size * (len(files) - 1),
        )
        db.add(group)
        db.flush()
        for i, f in enumerate(files):
            db.add(
                DuplicateGroupFile(
                    duplicate_group_id=group.id,
                    drive_file_id=f.id,
                    recommended_action="keep" if i == 0 else "trash",
                    user_selected_action=old.get(f.id),
                )
            )
    db.commit()
    return summary(db, account_id)


def summary(db: Session, account_id: int) -> dict:
    groups, files, savings = db.execute(
        select(
            func.count(),
            func.coalesce(func.sum(DuplicateGroup.file_count), 0),
            func.coalesce(func.sum(DuplicateGroup.potential_savings), 0),
        ).where(DuplicateGroup.account_id == account_id)
    ).one()
    return {"groups": groups, "duplicate_files": int(files), "potential_savings": int(savings)}
