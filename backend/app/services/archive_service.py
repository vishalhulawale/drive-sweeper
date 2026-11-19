"""Unpack zip, rar and tar archives in Drive into a new folder next to each archive, then move the
archive to Trash.

Per archive:
  1. re-check the archive live (yours, not trashed, unchanged since the scan) and download it;
  2. check its MD5 against Drive, and check there is room on the server's disk and in your Drive;
  3. create a folder with the archive's name (without the extension) in the archive's folder, and
     refuse if one already exists that an earlier attempt did not create;
  4. extract one file at a time to a temp file and upload it, mirroring the archive's folders;
     each upload is checked against the extracted file's MD5;
  5. only when every file is uploaded and verified, move the archive to Trash (recorded in the
     Cleanup history, so it can be restored).

A failed or cancelled attempt keeps its folder; the next attempt reuses it and skips files that are
already there with the same name and MD5. Nothing is ever deleted from Drive.
"""
import hashlib
import logging
import mimetypes
import os
import shutil
import tempfile
import threading
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session, aliased

from app.core.config import settings
from app.models import ArchiveExtraction, CleanupOperation, DriveFile
from app.services import duplicate_detector
from app.services.archive_reader import NAME_PATTERN, Archive, ArchiveError, folder_name_for, kind_of
from app.services.google_drive import FOLDER_MIME, DriveError, Interrupted, NotFound

log = logging.getLogger(__name__)

ARCHIVE_WORKERS = 3     # archives extracted at the same time
UPLOAD_WORKERS = 4      # uploads in parallel within one archive
MAX_ARCHIVES = 200      # per run
DISK_MARGIN = 2 * 1024**3   # always leave this much free on the server's disk
COPY_CHUNK = 1024 * 1024


class RunInProgress(Exception):
    pass


class Cancelled(Exception):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------- listing ----------

def list_archives(db: Session, account_id: int, owned_only: bool = True) -> list[dict]:
    """Archives not in Trash (only yours unless owned_only is False), each with its folder's name and its
    latest extraction. Archives shared with you are listed for reference but can never be extracted."""
    parent = aliased(DriveFile)
    rows = db.execute(
        select(DriveFile, parent.name)
        .outerjoin(parent, (parent.account_id == DriveFile.account_id) & (parent.google_file_id == DriveFile.parent_folder_id))
        .where(DriveFile.account_id == account_id, DriveFile.trashed.is_(False),
               DriveFile.is_owned_by_user.is_(True) if owned_only else True, DriveFile.is_shortcut.is_(False), DriveFile.mime_type != FOLDER_MIME, DriveFile.name.op("~*")(NAME_PATTERN))
        .order_by(DriveFile.size.desc().nulls_last())
    ).all()
    latest = _latest_by_file(db, account_id, [f.google_file_id for f, _ in rows])
    return [
        {"file": f, "kind": kind_of(f.name), "folder_name": folder_name_for(f.name),
         "parent_name": pname or ("My Drive" if f.is_owned_by_user else "Shared with me"), "last": latest.get(f.google_file_id)}
        for f, pname in rows
    ]


def _latest_by_file(db: Session, account_id: int, google_ids: list[str]) -> dict[str, ArchiveExtraction]:
    if not google_ids:
        return {}
    newest = (select(func.max(ArchiveExtraction.id))
              .where(ArchiveExtraction.account_id == account_id, ArchiveExtraction.google_file_id.in_(google_ids))
              .group_by(ArchiveExtraction.google_file_id))
    return {e.google_file_id: e for e in db.scalars(select(ArchiveExtraction).where(ArchiveExtraction.id.in_(newest)))}


# ---------- queueing, status, cancel ----------

def has_active(db: Session, account_id: int) -> bool:
    return db.scalar(select(ArchiveExtraction.id).where(
        ArchiveExtraction.account_id == account_id, ArchiveExtraction.status.in_(("pending", "running"))).limit(1)) is not None


def prepare(db: Session, account_id: int, file_ids: list[int]) -> list[int]:
    """Queue one pending extraction per chosen archive. Touches nothing in Drive."""
    if has_active(db, account_id):
        raise RunInProgress("Archives are already being extracted")
    if not file_ids or len(file_ids) > MAX_ARCHIVES:
        raise ValueError(f"Choose between 1 and {MAX_ARCHIVES} archives")
    files = list(db.scalars(select(DriveFile).where(DriveFile.account_id == account_id, DriveFile.id.in_(set(file_ids)))))
    bad = [f.name for f in files if f.trashed or not f.is_owned_by_user or not kind_of(f.name)]
    if len(files) != len(set(file_ids)) or bad:
        raise ValueError("Some of the chosen files are not archives you own: " + ", ".join(bad[:3]) if bad
                         else "Some of the chosen files are no longer in your Drive; refresh and try again")
    ids = []
    for f in files:
        ex = ArchiveExtraction(
            account_id=account_id, drive_file_id=f.id, google_file_id=f.google_file_id, archive_name=f.name,
            archive_size=f.size, archive_md5=f.md5_checksum, web_view_link=f.web_view_link,
            folder_name=folder_name_for(f.name), status="pending", stage="queued",
        )
        db.add(ex)
        db.flush()
        ids.append(ex.id)
    db.commit()
    return ids


def current_run(db: Session, account_id: int) -> list[ArchiveExtraction]:
    """The extractions of the active run, or of the most recent one."""
    first_active = db.scalar(select(func.min(ArchiveExtraction.created_at)).where(
        ArchiveExtraction.account_id == account_id, ArchiveExtraction.status.in_(("pending", "running"))))
    since = first_active or db.scalar(select(func.max(ArchiveExtraction.created_at)).where(
        ArchiveExtraction.account_id == account_id))
    if since is None:
        return []
    return list(db.scalars(select(ArchiveExtraction).where(
        ArchiveExtraction.account_id == account_id, ArchiveExtraction.created_at >= since).order_by(ArchiveExtraction.id)))


def cancel_pending(db: Session, account_id: int) -> int:
    rows = list(db.scalars(select(ArchiveExtraction).where(
        ArchiveExtraction.account_id == account_id, ArchiveExtraction.status == "pending")))
    for ex in rows:
        ex.status, ex.stage, ex.completed_at = "cancelled", "done", _now()
    db.commit()
    return len(rows)


def history(db: Session, account_id: int, limit: int = 200) -> list[ArchiveExtraction]:
    return list(db.scalars(select(ArchiveExtraction).where(ArchiveExtraction.account_id == account_id)
                           .order_by(ArchiveExtraction.id.desc()).limit(limit)))


def mark_orphans_interrupted(db: Session) -> int:
    rows = list(db.scalars(select(ArchiveExtraction).where(ArchiveExtraction.status.in_(("pending", "running")))))
    for ex in rows:
        ex.status, ex.stage, ex.completed_at = "failed", "done", _now()
        ex.error_message = "Interrupted by a server restart. Extract it again to continue where it stopped."
    db.commit()
    return len(rows)


# ---------- shared budgets (parallel archives must not overfill the disk or the Drive) ----------

class Budget:
    """Space reserved by running archives. `free()` is measured live; reservations of the others are
    subtracted on top, which double-counts space already written and so errs on the safe side."""

    def __init__(self, free, what: str, margin: int = 0):
        self._free, self.what, self.margin = free, what, margin
        self._reserved = 0
        self._cond = threading.Condition()

    def acquire(self, n: int, cancelled: threading.Event, wait_s: float = 2.0) -> None:
        with self._cond:
            while True:
                free = self._free()
                if free is None or free - self.margin - self._reserved >= n:
                    self._reserved += n
                    return
                if not self._reserved:  # nobody else holds space, so waiting cannot help
                    raise DriveError(f"Not enough {self.what}: needs {_gb(n)}, {_gb(max(free - self.margin, 0))} available")
                if cancelled.is_set():
                    raise Cancelled()
                self._cond.wait(wait_s)

    def release(self, n: int) -> None:
        with self._cond:
            self._reserved = max(self._reserved - n, 0)
            self._cond.notify_all()


def _gb(n: int) -> str:
    return f"{n / 1024**3:.1f} GB"


def _work_root() -> str:
    root = settings.extract_dir or os.path.join(tempfile.gettempdir(), "driveclean-extract")
    os.makedirs(root, exist_ok=True)
    return root


def disk_budget() -> Budget:
    root = _work_root()
    return Budget(lambda: shutil.disk_usage(root).free, "free space on the server's disk", DISK_MARGIN)


def drive_budget(client) -> Budget:
    def free():
        limit, usage = client.storage_quota()
        return None if limit is None else limit - usage
    return Budget(free, "free space in your Google Drive")


# ---------- running a batch ----------

def process(session_factory, account_id: int, client, extraction_ids: list[int], cancelled: threading.Event) -> None:
    """Extract the queued archives, ARCHIVE_WORKERS at a time. Each archive has its own DB session."""
    disk, drive = disk_budget(), drive_budget(client)
    with ThreadPoolExecutor(ARCHIVE_WORKERS, thread_name_prefix="archive") as pool:
        list(pool.map(lambda eid: _run_guarded(session_factory, client, eid, cancelled, disk, drive), extraction_ids))
    with session_factory() as db:
        duplicate_detector.refresh_all(db, account_id)  # trashed archives leave their duplicate groups


def _run_guarded(session_factory, client, extraction_id, cancelled, disk, drive) -> None:
    with session_factory() as db:
        ex = db.get(ArchiveExtraction, extraction_id)
        db.refresh(ex)
        if ex.status != "pending":  # cancelled while queued
            return
        if cancelled.is_set():
            _end(db, ex, "cancelled", None)
            return
        ex.status, ex.started_at = "running", _now()
        db.commit()
        try:
            extract_one(db, client, ex, cancelled, disk, drive)
        except (Cancelled, Interrupted):
            _end(db, ex, "cancelled", "Stopped (cancelled, or the server restarted). Extract it again to continue where it stopped.")
        except (DriveError, ArchiveError) as err:
            log.warning("Extraction of %s failed: %s", ex.archive_name, err)
            _end(db, ex, "failed", str(err))
        except Exception as err:  # never let one archive take down the batch
            log.exception("Extraction of %s crashed", ex.archive_name)
            db.rollback()
            _end(db, ex, "failed", f"Unexpected error: {type(err).__name__}: {err}")


def _end(db: Session, ex: ArchiveExtraction, status: str, error: str | None) -> None:
    ex.status, ex.stage, ex.error_message, ex.completed_at = status, "done", error, _now()
    db.commit()


def _stage(db: Session, ex: ArchiveExtraction, stage: str) -> None:
    ex.stage = stage
    db.commit()


def extract_one(db: Session, client, ex: ArchiveExtraction, cancelled: threading.Event, disk: Budget, drive: Budget) -> None:
    _stage(db, ex, "checking")
    try:
        live = client.get_file(ex.google_file_id)
    except NotFound:
        raise DriveError("The archive is no longer in Drive")
    problem = _check_archive(live, ex.archive_md5)
    if problem:
        raise DriveError(problem)
    ex.archive_md5 = ex.archive_md5 or live.get("md5Checksum")  # what the final check before Trash compares to
    parent_id = (live.get("parents") or ["root"])[0]
    size = int(live.get("size") or ex.archive_size or 0)
    kind = kind_of(ex.archive_name)

    workdir = tempfile.mkdtemp(prefix=f"x{ex.id}-", dir=_work_root())
    held_disk = held_drive = 0
    try:
        disk.acquire(size, cancelled)
        held_disk = size
        _stage(db, ex, "downloading")
        local = os.path.join(workdir, "archive")
        client.download_to(ex.google_file_id, local, stop=cancelled)
        if live.get("md5Checksum") and _md5_file(local) != live["md5Checksum"]:
            raise DriveError("The download did not match the archive in Drive; try again")
        if cancelled.is_set():
            raise Cancelled()

        with Archive(local, kind) as archive:
            entries = archive.entries
            ex.files_total, ex.entries_ignored = len(entries), archive.ignored
            ex.bytes_total = sum(e.size for e in entries)
            ex.files_done = ex.files_skipped = ex.bytes_done = 0
            db.commit()
            # Room for the files waiting to upload at once, on top of the archive itself.
            biggest = sorted((e.size for e in entries), reverse=True)[: UPLOAD_WORKERS * 2]
            disk.acquire(sum(biggest), cancelled)
            held_disk += sum(biggest)
            drive.acquire(ex.bytes_total, cancelled)
            held_drive = ex.bytes_total

            root_id, resumed = _target_folder(db, client, ex, parent_id)
            _stage(db, ex, "uploading")
            failures = _upload_all(db, client, ex, entries, root_id, resumed, workdir, cancelled)
        if failures:
            raise DriveError(f"{len(failures)} of {ex.files_total} files could not be uploaded "
                             f"(first: {failures[0]}). The archive was kept; extract it again to retry them.")

        _stage(db, ex, "trashing")
        _trash_archive(db, client, ex)
        _end(db, ex, "completed", None if ex.archive_trashed else ex.error_message)
    finally:
        disk.release(held_disk)
        drive.release(held_drive)
        shutil.rmtree(workdir, ignore_errors=True)


def _check_archive(live: dict, md5: str | None) -> str | None:
    if live.get("trashed"):
        return "The archive is in Trash"
    if not live.get("ownedByMe", False):
        return "The archive is not owned by you"
    if md5 and live.get("md5Checksum") and live["md5Checksum"] != md5:
        return "The archive changed since the scan; sync or rescan first"
    return None


def _target_folder(db: Session, client, ex: ArchiveExtraction, parent_id: str) -> tuple[str, bool]:
    """(folder id, resumed). Reuse the folder of an earlier unfinished attempt if it is still there;
    otherwise create one, refusing to write into a folder of the same name that we did not create."""
    earlier = db.scalar(
        select(ArchiveExtraction.folder_google_id)
        .where(ArchiveExtraction.account_id == ex.account_id, ArchiveExtraction.google_file_id == ex.google_file_id,
               ArchiveExtraction.id != ex.id, ArchiveExtraction.folder_google_id.is_not(None),
               ArchiveExtraction.status.in_(("failed", "cancelled")))
        .order_by(ArchiveExtraction.id.desc()).limit(1)
    )
    if earlier:
        try:
            folder = client.get_file(earlier)
            if not folder.get("trashed") and parent_id in (folder.get("parents") or []):
                ex.folder_google_id = earlier
                db.commit()
                return earlier, True
        except NotFound:
            pass
    if client.find_folder(ex.folder_name, parent_id):
        raise DriveError(f'A folder named "{ex.folder_name}" already exists next to the archive. '
                         "Rename or move it, then try again.")
    ex.folder_google_id = client.create_folder(ex.folder_name, parent_id)
    db.commit()  # saved at once, so a crash after this point resumes into the same folder
    return ex.folder_google_id, False


def _upload_all(db, client, ex, entries, root_id, resumed, workdir, cancelled) -> list[str]:
    """Extract and upload every entry; returns the failure messages. DB work stays on this thread."""
    folders: dict[tuple[str, ...], str] = {(): root_id}
    existing: dict[str, dict[str, dict]] = {}  # folder id -> {name: child} (only when resuming)
    failures: list[str] = []
    running: dict[Future, tuple[str, int, str, str]] = {}

    def children(folder_id: str) -> dict[str, dict]:
        if folder_id not in existing:
            existing[folder_id] = {c["name"]: c for c in client.list_children(folder_id)} if resumed else {}
        return existing[folder_id]

    def folder_for(parts: tuple[str, ...]) -> str:
        if parts not in folders:
            parent = folder_for(parts[:-1])
            hit = children(parent).get(parts[-1])
            if hit and hit.get("mimeType") == FOLDER_MIME:
                folders[parts] = hit["id"]
            else:
                folders[parts] = client.create_folder(parts[-1], parent)
                existing.setdefault(folders[parts], {})  # new and empty
        return folders[parts]

    def collect(block: bool) -> None:
        done = wait(running, return_when=FIRST_COMPLETED)[0] if block else [f for f in running if f.done()]
        for fut in done:
            path, size, md5, tmp = running.pop(fut)
            try:
                result = fut.result()
                if result.get("md5Checksum") and result["md5Checksum"] != md5:
                    failures.append(f"{path}: Drive stored different contents")
                else:
                    ex.files_done += 1
                    ex.bytes_done += size
            except DriveError as err:
                failures.append(f"{path}: {err}")
            except Interrupted:
                pass  # stopping: not a failure; the loop raises Cancelled, and a later attempt uploads it
            finally:
                _discard(tmp)
        if done:
            db.commit()

    with ThreadPoolExecutor(UPLOAD_WORKERS, thread_name_prefix="upload") as pool:
        for n, entry in enumerate(entries):
            if cancelled.is_set():
                while running:  # let uploads already started finish, so they are counted
                    collect(block=True)
                db.commit()
                raise Cancelled()
            while len(running) >= UPLOAD_WORKERS * 2:
                collect(block=True)
            path = "/".join(entry.parts)
            try:
                parent = folder_for(entry.parts[:-1])
            except DriveError as err:
                failures.append(f"{path}: could not create its folder ({err})")
                continue
            tmp = os.path.join(workdir, f"f{n}")
            try:
                md5 = _copy_out(entry, tmp)
            except (OSError, EOFError, ValueError) as err:
                failures.append(f"{path}: could not be read from the archive ({err})")
                continue
            except Exception as err:  # zip/rar decompression errors come in many types
                failures.append(f"{path}: could not be read from the archive ({type(err).__name__}: {err})")
                continue
            name = entry.parts[-1]
            prior = children(parent).get(name)
            if prior and prior.get("md5Checksum") == md5:
                _discard(tmp)
                ex.files_skipped += 1
                ex.files_done += 1
                ex.bytes_done += entry.size
                continue
            mime = mimetypes.guess_type(name)[0] or "application/octet-stream"
            running[pool.submit(client.upload_file, tmp, name, parent, mime, stop=cancelled)] = (path, entry.size, md5, tmp)
            collect(block=False)
        while running:
            collect(block=True)
    db.commit()
    if cancelled.is_set():
        raise Cancelled()
    return failures


def _discard(path: str) -> None:
    """Remove a temp file; if it cannot be removed yet (still open on Windows), the work folder is
    removed at the end of the archive anyway, so this is never a reason to fail."""
    try:
        os.remove(path)
    except OSError as err:
        log.info("Temp file %s left for the final cleanup: %s", path, err)


def _copy_out(entry, dest: str) -> str:
    h = hashlib.md5()
    with entry.open() as src, open(dest, "wb") as out:
        while chunk := src.read(COPY_CHUNK):
            h.update(chunk)
            out.write(chunk)
    return h.hexdigest()


def _md5_file(path: str) -> str:
    h = hashlib.md5()
    with open(path, "rb") as fh:
        while chunk := fh.read(COPY_CHUNK * 8):
            h.update(chunk)
    return h.hexdigest()


def _trash_archive(db: Session, client, ex: ArchiveExtraction) -> None:
    """Every file is in Drive: move the archive to Trash, after one more live check. Recorded like a
    Cleanup action, so it shows in the Cleanup history and can be restored."""
    try:
        live = client.get_file(ex.google_file_id)
        problem = _check_archive(live, ex.archive_md5)
        if not problem and (live.get("capabilities") or {}).get("canTrash") is False:
            problem = "Drive does not allow trashing it"
        if problem:
            ex.error_message = f"All files were extracted, but the archive was kept: {problem}"
            return
        client.set_trashed(ex.google_file_id, True)
    except DriveError as err:
        ex.error_message = f"All files were extracted, but the archive could not be moved to Trash: {err}"
        return
    ex.archive_trashed = True
    f = db.get(DriveFile, ex.drive_file_id) if ex.drive_file_id else None
    if f is not None:
        f.trashed, f.trashed_time = True, _now()
        op = CleanupOperation.for_file(f, account_id=ex.account_id, operation_type="trash", status="completed",
                                       previous_parent_ids=live.get("parents") or f.parent_ids, completed_at=_now())
    else:
        op = CleanupOperation(account_id=ex.account_id, google_file_id=ex.google_file_id, file_name=ex.archive_name,
                              file_size=ex.archive_size, web_view_link=ex.web_view_link, operation_type="trash",
                              status="completed", previous_parent_ids=live.get("parents"), completed_at=_now())
    db.add(op)
    db.commit()
