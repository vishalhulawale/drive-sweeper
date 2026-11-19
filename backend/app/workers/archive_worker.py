"""Runs an archive extraction batch in a background thread; each archive gets its own DB session.

Progress, cancel and crash recovery all work through the archive_extractions table, plus an in-memory
flag that tells running archives to stop after the files they are uploading.
"""
import logging
import threading

from app.core.database import SessionLocal
from app.services import archive_service, sync_service

log = logging.getLogger(__name__)
_lock = threading.Lock()
_active: dict[int, threading.Event] = {}


def run(account_id: int, client, extraction_ids: list[int], cancelled: threading.Event, session_factory=SessionLocal) -> None:
    try:
        archive_service.process(session_factory, account_id, client, extraction_ids, cancelled)
        with session_factory() as db:
            try:  # bring the new folders and files into the inventory right away
                sync_service.sync(db, account_id, client)
            except Exception as err:  # a scan or sync is running, or Drive is unreachable: the next sync catches up
                log.info("Sync after extraction skipped: %s", err)
    except Exception:
        log.exception("Archive worker crashed for account %s", account_id)
        with session_factory() as db:
            archive_service.mark_orphans_interrupted(db)
    finally:
        with _lock:
            _active.pop(account_id, None)


def start(account_id: int, client, extraction_ids: list[int]) -> None:
    with _lock:
        if account_id in _active:
            return
        cancelled = _active[account_id] = threading.Event()
    threading.Thread(target=run, args=(account_id, client, extraction_ids, cancelled),
                     name=f"archives-{account_id}", daemon=True).start()


def stop_all() -> None:
    """Server shutdown (including a dev auto-reload): stop every run after the current chunk, so the
    process can exit. The archives are recorded as stopped and resume when extracted again."""
    with _lock:
        events = list(_active.values())
    for event in events:
        event.set()


def cancel(account_id: int) -> None:
    with _lock:
        event = _active.get(account_id)
    if event:
        event.set()
