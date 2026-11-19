"""Exact duplicate detection from Drive metadata. Read-only: never touches Drive.

Candidates share MD5 and size; SHA-256 (also reported by Drive) then verifies them, because MD5 alone
can collide. A same-MD5 set whose SHA-256 values disagree is split by SHA-256, and files with no
SHA-256 in such a set are left out as unverifiable. Sets with no SHA-256 at all fall back to MD5.
"""
from collections import defaultdict

from sqlalchemy import delete, func, insert, select
from sqlalchemy.orm import Session

from app.models import DriveFile, DuplicateGroup, DuplicateGroupFile

GAPPS = "application/vnd.google-apps."
EXACT = "exact"


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
            .where(DuplicateGroup.account_id == account_id, DuplicateGroup.detection_type == EXACT,
                   DuplicateGroupFile.user_selected_action.is_not(None))
        )
    }
    db.execute(delete(DuplicateGroup).where(DuplicateGroup.account_id == account_id,
                                            DuplicateGroup.detection_type == EXACT))

    # One query for every candidate (files whose MD5 + size occurs more than once), columns only.
    keys = (
        select(DriveFile.md5_checksum.label("k_md5"), DriveFile.size.label("k_size"))
        .where(*_eligible(account_id))
        .group_by(DriveFile.md5_checksum, DriveFile.size)
        .having(func.count() > 1)
        .subquery()
    )
    rows = db.execute(
        select(DriveFile.id, DriveFile.md5_checksum, DriveFile.size, DriveFile.sha256_checksum,
               DriveFile.created_time, DriveFile.name)
        .join(keys, (keys.c.k_md5 == DriveFile.md5_checksum) & (keys.c.k_size == DriveFile.size))
        .where(*_eligible(account_id))
    ).all()
    candidates: dict[tuple, list] = defaultdict(list)
    for r in rows:
        candidates[(r.md5_checksum, r.size)].append(r)

    groups = []
    for (md5, size), files in candidates.items():
        for algorithm, members in _verified_sets(files):
            members.sort(key=_keeper_key)
            groups.append((
                dict(account_id=account_id, detection_type=EXACT, hash_algorithm=algorithm, content_hash=md5,
                     file_count=len(members), total_size=size * len(members),
                     potential_savings=size * (len(members) - 1)),
                [(m.id, "keep" if i == 0 else "trash") for i, m in enumerate(members)],
            ))
    save_groups(db, groups, old)
    db.commit()
    return summary(db, account_id)


def _verified_sets(files: list[DriveFile]) -> list[tuple[str, list[DriveFile]]]:
    by_sha: dict[str | None, list[DriveFile]] = defaultdict(list)
    for f in files:
        by_sha[f.sha256_checksum].append(f)
    if set(by_sha) == {None}:
        return [("md5", files)]  # nothing to verify against; MD5 + size as before
    return [("md5+sha256", fs) for sha, fs in by_sha.items() if sha is not None and len(fs) > 1]


def save_groups(db: Session, groups: list[tuple[dict, list[tuple[int, str]]]], old: dict[int, str]) -> None:
    """Insert groups and their members in two statements (not one round trip per row).
    groups: (group columns, [(drive_file_id, recommended_action), ...] in display order);
    old: drive_file_id -> the user's earlier keep/trash choice, carried over."""
    if not groups:
        return
    ids = db.scalars(
        insert(DuplicateGroup).returning(DuplicateGroup.id, sort_by_parameter_order=True),
        [g for g, _ in groups],
    ).all()
    db.execute(insert(DuplicateGroupFile), [
        dict(duplicate_group_id=gid, drive_file_id=fid, recommended_action=action,
             user_selected_action=old.get(fid))
        for gid, (_, members) in zip(ids, groups) for fid, action in members
    ])


def refresh_all(db: Session, account_id: int) -> None:
    """Rebuild exact groups and re-group near-duplicates from stored fingerprints (both keep the
    user's choices). Call after anything that changes which files are live."""
    from app.services import near_duplicate_service  # local import: it depends on this package's models

    rebuild(db, account_id)
    near_duplicate_service.detect(db, account_id)


def summary(db: Session, account_id: int) -> dict:
    groups, files, savings = db.execute(
        select(
            func.count(),
            func.coalesce(func.sum(DuplicateGroup.file_count), 0),
            func.coalesce(func.sum(DuplicateGroup.potential_savings), 0),
        ).where(DuplicateGroup.account_id == account_id, DuplicateGroup.detection_type == EXACT)
    ).one()
    return {"groups": groups, "duplicate_files": int(files), "potential_savings": int(savings)}
