"""Near-duplicate photo detection from small Drive thumbnails (never the original files).

Steps: (1) hash: fetch a 64 px thumbnail per image and store a perceptual hash on the file row;
(2) detect: cluster similar hashes into review groups. The hashing job is resumable: a file is skipped
once it has a hash for its current contents (md5), and progress is committed page by page.
Nothing here changes anything in Drive.
"""
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.models import DriveFile, DuplicateGroup, DuplicateGroupFile
from app.services import perceptual
from app.services.google_drive import DriveError

log = logging.getLogger(__name__)

MIN_SIZE = 30 * 1024        # tiny images (icons, emoji) match each other far too easily
FETCH_WORKERS = 32          # I/O-bound (thumbnail downloads); each thread keeps its own HTTP connection
THUMB_PX = 64
NEAR = "near"


def _eligible(account_id: int):
    return (
        DriveFile.account_id == account_id,
        DriveFile.trashed.is_(False),
        DriveFile.is_owned_by_user.is_(True),
        DriveFile.mime_type.like("image/%"),
        DriveFile.mime_type != "image/svg+xml",
        DriveFile.md5_checksum.is_not(None),
        DriveFile.size >= MIN_SIZE,
    )


def _needs_hash():
    """No attempt yet for the file's current contents."""
    return or_(DriveFile.phash_md5.is_(None), DriveFile.phash_md5 != DriveFile.md5_checksum)


def status(db: Session, account_id: int) -> dict:
    eligible = db.scalar(select(func.count()).select_from(DriveFile).where(*_eligible(account_id))) or 0
    pending = db.scalar(select(func.count()).select_from(DriveFile).where(*_eligible(account_id), _needs_hash())) or 0
    hashed = db.scalar(
        select(func.count()).select_from(DriveFile).where(
            *_eligible(account_id), ~_needs_hash(), DriveFile.perceptual_hash.is_not(None))
    ) or 0
    groups, files, savings = db.execute(
        select(func.count(), func.coalesce(func.sum(DuplicateGroup.file_count), 0),
               func.coalesce(func.sum(DuplicateGroup.potential_savings), 0))
        .where(DuplicateGroup.account_id == account_id, DuplicateGroup.detection_type == NEAR)
    ).one()
    return {
        "eligible": eligible, "hashed": hashed, "unhashable": eligible - hashed - pending, "pending": pending,
        "groups": groups, "similar_files": int(files), "potential_savings": int(savings),
    }


def _hash_one(client, link: str | None) -> tuple[str | None, bool]:
    """Returns (hash_hex or None, final). final=False means a transient failure: try again next run."""
    if not link:
        return None, True
    try:
        return perceptual.to_hex(perceptual.dhash_bytes(client.fetch_thumbnail(link, THUMB_PX))), True
    except perceptual.BadImage:
        return None, True
    except DriveError as err:
        log.debug("Thumbnail fetch failed: %s", err)
        return None, False


def run_hashing(session_factory, client, account_id: int, cancel: threading.Event | None = None,
                progress=None) -> dict:
    """Hash every image that still needs it. Safe to stop and restart at any time."""
    cancel = cancel or threading.Event()
    done = skipped = 0
    with session_factory() as db, ThreadPoolExecutor(FETCH_WORKERS) as pool, ThreadPoolExecutor(1) as lister:
        # List the next page while the current one is being downloaded and hashed.
        next_page = lister.submit(client.list_image_thumbnails_page, None)
        while True:
            page, token = next_page.result()
            if token is not None and not cancel.is_set():
                next_page = lister.submit(client.list_image_thumbnails_page, token)
            links = {f["id"]: f.get("thumbnailLink") for f in page}
            if links:
                rows = db.execute(
                    select(DriveFile.id, DriveFile.google_file_id, DriveFile.md5_checksum)
                    .where(*_eligible(account_id), DriveFile.google_file_id.in_(list(links)), _needs_hash())
                ).all()

                def work(r):
                    if cancel.is_set():
                        return None  # stop promptly; untouched rows stay pending
                    return _hash_one(client, links[r.google_file_id])

                results = list(pool.map(work, rows))
                now = datetime.now(timezone.utc)
                updates = []
                for r, res in zip(rows, results):
                    if res is None or not res[1]:
                        skipped += 1
                        continue
                    updates.append({"id": r.id, "perceptual_hash": res[0], "phash_attempted_at": now,
                                    "phash_md5": r.md5_checksum})
                if updates:
                    db.bulk_update_mappings(DriveFile, updates)
                    done += len(updates)
                db.commit()  # progress survives a stop or crash
                if progress:
                    progress(done)
            if cancel.is_set() or token is None:
                break
    with session_factory() as db:
        detect(db, account_id)
    return {"hashed": done, "retry_later": skipped, "cancelled": cancel.is_set()}


def _keeper_key(f: DriveFile):
    # Keep the largest file (a proxy for the highest resolution); ties go to the oldest.
    return (-(f.size or 0), f.created_time is None, f.created_time, f.id)


def detect(db: Session, account_id: int, max_distance: int = perceptual.DEFAULT_MAX_DISTANCE) -> dict:
    """Rebuild near-duplicate groups from stored hashes, keeping the user's earlier keep/trash choices."""
    old = {
        row.drive_file_id: row.user_selected_action
        for row in db.execute(
            select(DuplicateGroupFile.drive_file_id, DuplicateGroupFile.user_selected_action)
            .join(DuplicateGroup, DuplicateGroup.id == DuplicateGroupFile.duplicate_group_id)
            .where(DuplicateGroup.account_id == account_id, DuplicateGroup.detection_type == NEAR,
                   DuplicateGroupFile.user_selected_action.is_not(None))
        )
    }
    db.execute(delete(DuplicateGroup).where(DuplicateGroup.account_id == account_id,
                                            DuplicateGroup.detection_type == NEAR))
    files = {
        f.id: f for f in db.scalars(
            select(DriveFile).where(*_eligible(account_id), ~_needs_hash(), DriveFile.perceptual_hash.is_not(None))
        )
    }
    clusters = perceptual.cluster(
        [(fid, perceptual.from_hex(f.perceptual_hash)) for fid, f in files.items()], max_distance
    )
    for ids in clusters:
        members = sorted((files[i] for i in ids), key=_keeper_key)
        if len({m.md5_checksum for m in members}) < 2:
            continue  # byte-identical copies are handled by exact duplicate detection
        keeper = members[0]
        total = sum(m.size or 0 for m in members)
        group = DuplicateGroup(
            account_id=account_id, detection_type=NEAR, hash_algorithm="dhash",
            content_hash=keeper.perceptual_hash, file_count=len(members), total_size=total,
            potential_savings=total - (keeper.size or 0),
        )
        db.add(group)
        db.flush()
        for m in members:
            db.add(DuplicateGroupFile(
                duplicate_group_id=group.id, drive_file_id=m.id,
                recommended_action="keep" if m is keeper else "trash",
                user_selected_action=old.get(m.id),
            ))
    db.commit()
    return status(db, account_id)
