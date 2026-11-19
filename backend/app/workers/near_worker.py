"""Runs the thumbnail-hashing job in a background thread (one at a time).

Progress is derived from the database (files still needing a hash), so it survives restarts; this
module only tracks whether a thread is alive and lets the user ask it to stop.
"""
import logging
import threading

from app.core.database import SessionLocal
from app.services import near_duplicate_service as nds

log = logging.getLogger(__name__)
_lock = threading.Lock()
_cancel = threading.Event()
_active: dict[str, object] = {"running": False, "last_error": None, "last_result": None}


def state() -> dict:
    with _lock:
        return dict(_active)


def _run(account_id: int, client) -> None:
    try:
        result = nds.run_hashing(SessionLocal, client, account_id, _cancel)
        with _lock:
            _active["last_result"], _active["last_error"] = result, None
    except Exception as err:
        log.exception("Near-duplicate hashing crashed")
        with _lock:
            _active["last_error"] = f"{type(err).__name__}: {err}"[:500]
    finally:
        with _lock:
            _active["running"] = False


def start(account_id: int, client) -> bool:
    with _lock:
        if _active["running"]:
            return False
        _active["running"], _active["last_error"] = True, None
    _cancel.clear()
    threading.Thread(target=_run, args=(account_id, client), name="near-hash", daemon=True).start()
    return True


def cancel() -> None:
    _cancel.set()
