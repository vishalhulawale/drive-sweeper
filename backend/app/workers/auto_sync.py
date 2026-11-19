"""Background scheduler: runs quick sync every N minutes while the server is up.

Read-only towards Drive. It never starts while a full scan or another sync is running, backs off after
a failure, and can be switched off in Settings. Sync itself is idempotent and resumable, so a crash
mid-run is harmless.
"""
import logging
import threading
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models import DriveAccount, SyncState
from app.services import oauth_service, sync_service
from app.services.google_drive import DriveClient

log = logging.getLogger(__name__)

TICK_SECONDS = 30
RETRY_AFTER_FAILURE = 300  # seconds

_last_attempt: dict[int, float] = {}
_stop = threading.Event()
_thread: threading.Thread | None = None


def reset_stuck(db: Session) -> int:
    """At startup: a sync that was 'running' when the server died is not running any more."""
    result = db.execute(update(SyncState).where(SyncState.sync_status == "running").values(sync_status="idle"))
    db.commit()
    return result.rowcount or 0


def is_due(state: SyncState, now: float, now_dt: datetime) -> bool:
    if not state.auto_sync_enabled or not state.changes_page_token or state.sync_status == "running":
        return False
    interval = state.auto_sync_minutes * 60
    last = state.last_sync_at
    if last is not None and (now_dt - last) < timedelta(seconds=interval):
        return False
    attempted = _last_attempt.get(state.account_id)
    return attempted is None or now - attempted >= min(interval, RETRY_AFTER_FAILURE)


def run_due(session_factory=SessionLocal, client_factory=DriveClient, now: float | None = None) -> list[int]:
    """One scheduler tick. Returns the account ids that were synced (or attempted)."""
    now = time.time() if now is None else now
    now_dt = datetime.now(timezone.utc)
    attempted = []
    with session_factory() as db:
        for state in list(db.scalars(select(SyncState))):
            if not is_due(state, now, now_dt):
                continue
            _last_attempt[state.account_id] = now
            attempted.append(state.account_id)
            _sync_one(db, state.account_id, client_factory)
    return attempted


def _sync_one(db: Session, account_id: int, client_factory) -> None:
    account = db.get(DriveAccount, account_id)
    if account is None:
        return
    error = None
    try:
        creds = oauth_service.credentials_for(account)
        sync_service.sync(db, account_id, client_factory(creds))
        oauth_service.persist_credentials(db, account, creds)
    except sync_service.ScanActive:
        return  # a full scan is running; try again on a later tick without recording an error
    except sync_service.SyncUnavailable as err:
        error = str(err)
    except Exception as err:  # keep the scheduler alive whatever Drive or the network does
        log.warning("Auto sync failed: %s", err)
        error = f"{type(err).__name__}: {err}"[:500]
    db.rollback()
    state = sync_service.get_state(db, account_id)
    if state is not None:
        state.last_error = error
        db.commit()


def _loop() -> None:
    while not _stop.wait(TICK_SECONDS):
        try:
            run_due()
        except Exception:
            log.exception("Auto sync tick crashed")


def start() -> None:
    global _thread
    if _thread and _thread.is_alive():
        return
    _stop.clear()
    _thread = threading.Thread(target=_loop, name="auto-sync", daemon=True)
    _thread.start()


def stop() -> None:
    _stop.set()
