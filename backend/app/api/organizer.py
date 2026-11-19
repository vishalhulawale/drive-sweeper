from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.cleanup import _op_out, get_drive_client
from app.core.database import get_db
from app.models import DriveFile
from app.repositories import scan_repository
from app.schemas.files import FileOut
from app.schemas.organizer import ApplyIn, ContentStatus, OperationOut, Suggestion, SuggestionPage
from app.services import content_classifier as cc
from app.services import oauth_service, organizer_service as org
from app.workers import topic_worker

router = APIRouter(prefix="/api/organizer", tags=["organizer"])


def _account(db: Session):
    account = oauth_service.get_account(db)
    if account is None:
        raise HTTPException(401, "No Google Drive account connected")
    return account


@router.get("/suggestions", response_model=SuggestionPage)
def suggestions(
    source: str = Query("root", max_length=128, description="'root' for loose top-level files, or a folder id"),
    limit: int = Query(200, ge=1, le=500),
    method: Literal["pattern", "content"] = Query("pattern", description="'content' uses the topics Claude picked"),
    db: Session = Depends(get_db),
):
    """Proposed moves. Read-only: nothing happens in Drive."""
    files = org.live_files(db, _account(db).id)
    propose = org.propose_by_content if method == "content" else org.propose
    items = propose(files, source=source, limit=limit)
    return SuggestionPage(
        source=source,
        method=method,
        items=[
            Suggestion(
                file=FileOut.model_validate(i["file"]), folder_id=i["folder_id"], folder_name=i["folder_name"],
                new_folder=i["new_folder"], score=i["score"], confidence=i["confidence"], reasons=i["reasons"],
                summary=i["summary"],
            )
            for i in items
        ],
    )


@router.post("/apply", response_model=list[OperationOut])
def apply(body: ApplyIn, db: Session = Depends(get_db), client=Depends(get_drive_client)):
    account = _account(db)
    try:
        ops = org.apply_moves(db, account.id, client, [m.model_dump() for m in body.moves])
    except org.TooManyMoves as err:
        raise HTTPException(400, str(err))
    except LookupError as err:
        raise HTTPException(404, str(err))
    except ValueError as err:
        raise HTTPException(400, str(err))
    return [_op_out(op, db.get(DriveFile, op.drive_file_id) if op.drive_file_id else None) for op in ops]


@router.get("/history", response_model=list[OperationOut])
def history(db: Session = Depends(get_db)):
    return [_op_out(op, f) for op, f in org.history(db, _account(db).id)]


@router.post("/operations/{op_id}/undo", response_model=OperationOut)
def undo(op_id: int, db: Session = Depends(get_db), client=Depends(get_drive_client)):
    try:
        op = org.undo(db, _account(db).id, client, op_id)
    except LookupError as err:
        raise HTTPException(404, str(err))
    except ValueError as err:
        raise HTTPException(409, str(err))
    return _op_out(op, db.get(DriveFile, op.drive_file_id) if op.drive_file_id else None)


# ---- content analysis (Claude reads file excerpts to pick topic folders) --------------------------------


def get_ai_client():
    """Dependency so tests can substitute a fake Anthropic client."""
    return cc.anthropic_client()


def _content_status(db: Session, account_id: int, source: str) -> ContentStatus:
    s = topic_worker.state()
    return ContentStatus(
        configured=cc.configured(), running=bool(s["running"]), last_error=s["last_error"],
        last_result=s["last_result"], progress_done=int(s["done"]), progress_total=int(s["total"]),
        **cc.status(db, account_id, source),
    )


@router.get("/content/status", response_model=ContentStatus)
def content_status(source: str = Query("root", max_length=128), db: Session = Depends(get_db)):
    return _content_status(db, _account(db).id, source)


@router.post("/content/start", response_model=ContentStatus, status_code=202)
def content_start(source: str = Query("root", max_length=128), db: Session = Depends(get_db),
                  client=Depends(get_drive_client), ai=Depends(get_ai_client)):
    """Read an excerpt of each loose file in source and ask Claude for its topic folder. Resumable.
    Needs the full Drive permission (to read contents) and an Anthropic API key."""
    account = _account(db)
    if scan_repository.get_active(db, account.id):
        raise HTTPException(409, "A full scan is running; try again when it finishes")
    if not topic_worker.start(account.id, client, ai, source):
        raise HTTPException(409, "Content analysis is already running")
    return _content_status(db, account.id, source)


@router.post("/content/cancel", response_model=ContentStatus)
def content_cancel(source: str = Query("root", max_length=128), db: Session = Depends(get_db)):
    topic_worker.cancel()
    return _content_status(db, _account(db).id, source)
