"""Runs a cleanup (move to Trash) in a background thread with its own DB session.

Operations are queued as 'pending' rows first, so progress, cancel and crash recovery all work
through the cleanup_operations table.
"""
import logging
import threading

from app.core.database import SessionLocal
from app.services import cleanup_service

log = logging.getLogger(__name__)
_lock = threading.Lock()
_active: set[int] = set()


def run(account_id: int, client, jobs: list[dict]) -> None:
    db = SessionLocal()
    try:
        cleanup_service.process(db, account_id, client, jobs)
    except Exception:
        log.exception("Cleanup worker crashed for account %s", account_id)
        db.rollback()
        from app.models import CleanupOperation

        for op in db.query(CleanupOperation).filter_by(account_id=account_id, status="pending"):
            op.status = "failed"
            op.error_message = "Worker crashed; see server logs."
        db.commit()
    finally:
        db.close()
        with _lock:
            _active.discard(account_id)


def start(account_id: int, client, jobs: list[dict]) -> None:
    with _lock:
        if account_id in _active:
            return
        _active.add(account_id)
    threading.Thread(target=run, args=(account_id, client, jobs), name=f"cleanup-{account_id}", daemon=True).start()
