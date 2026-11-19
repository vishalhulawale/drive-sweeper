from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.cleanup import _op_out, get_drive_client
from app.core.database import get_db
from app.models import DriveFile
from app.schemas.files import FileOut
from app.schemas.organizer import ApplyIn, OperationOut, Suggestion, SuggestionPage
from app.services import oauth_service, organizer_service as org

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
    db: Session = Depends(get_db),
):
    """Proposed moves. Read-only: nothing happens in Drive."""
    files = org.live_files(db, _account(db).id)
    items = org.propose(files, source=source, limit=limit)
    return SuggestionPage(
        source=source,
        items=[
            Suggestion(
                file=FileOut.model_validate(i["file"]), folder_id=i["folder_id"], folder_name=i["folder_name"],
                score=i["score"], confidence=i["confidence"], reasons=i["reasons"],
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
