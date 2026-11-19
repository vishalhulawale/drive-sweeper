"""Runs the organizer's content classification in a background thread (one run at a time).

What has been classified is stored on each file, so a stopped or crashed run resumes where it left off;
this module only tracks whether a thread is alive, its progress, and lets the user ask it to stop.
"""
import logging
import threading

from app.core.database import SessionLocal
from app.services import content_classifier as cc

log = logging.getLogger(__name__)
_lock = threading.Lock()
_cancel = threading.Event()
_active: dict[str, object] = {"running": False, "last_error": None, "last_result": None, "done": 0, "total": 0}


def state() -> dict:
    with _lock:
        return dict(_active)


def _progress(done: int, total: int) -> None:
    with _lock:
        _active["done"], _active["total"] = done, total


def _run(account_id: int, drive, ai, source: str) -> None:
    try:
        result = cc.run(SessionLocal, drive, ai, account_id, source, _cancel, _progress)
        with _lock:
            _active["last_result"], _active["last_error"] = result, None
    except Exception as err:
        log.exception("Content classification crashed")
        with _lock:
            _active["last_error"] = f"{type(err).__name__}: {err}"[:500]
    finally:
        with _lock:
            _active["running"] = False


def start(account_id: int, drive, ai, source: str) -> bool:
    with _lock:
        if _active["running"]:
            return False
        _active.update(running=True, last_error=None, done=0, total=0)
    _cancel.clear()
    threading.Thread(target=_run, args=(account_id, drive, ai, source), name="topic-classify", daemon=True).start()
    return True


def cancel() -> None:
    _cancel.set()
