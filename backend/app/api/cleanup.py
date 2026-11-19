from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.cleanup import CleanupPlan, ExecuteIn, OperationOut, PlanItem, BlockedGroup
from app.schemas.files import FileOut
from app.services import cleanup_service, oauth_service
from app.services.google_drive import DriveClient

router = APIRouter(prefix="/api/cleanup", tags=["cleanup"])


def _account(db: Session):
    account = oauth_service.get_account(db)
    if account is None:
        raise HTTPException(401, "No Google Drive account connected")
    return account


def get_drive_client(db: Session = Depends(get_db)) -> DriveClient:
    """Dependency so tests can substitute a fake client."""
    account = _account(db)
    if not oauth_service.can_trash(account):
        raise HTTPException(403, "Trash permission not granted. Use 'Allow cleanup' to grant it.")
    creds = oauth_service.credentials_for(account)
    client = DriveClient(creds)
    return client


def _op_out(op, f) -> OperationOut:
    return OperationOut(
        id=op.id, operation_type=op.operation_type, status=op.status, file_name=f.name, file_size=f.size,
        web_view_link=f.web_view_link, created_at=op.created_at, completed_at=op.completed_at,
        error_message=op.error_message,
    )


@router.get("/plan", response_model=CleanupPlan)
def plan(db: Session = Depends(get_db)):
    p = cleanup_service.build_plan(db, _account(db).id)
    return CleanupPlan(
        count=p["count"], bytes=p["bytes"], max_batch=cleanup_service.MAX_BATCH,
        items=[
            PlanItem(group_id=i["group_id"], file=FileOut.model_validate(i["file"]), keeper_name=i["keeper"].name)
            for i in p["items"]
        ],
        blocked=[BlockedGroup(**b) for b in p["blocked"]],
    )


@router.post("/execute", response_model=list[OperationOut])
def execute(body: ExecuteIn, db: Session = Depends(get_db), client=Depends(get_drive_client)):
    account = _account(db)
    try:
        ops = cleanup_service.execute(db, account.id, client, body.expected_count)
    except cleanup_service.PlanChanged as err:
        raise HTTPException(409, str(err))
    except cleanup_service.TooManyFiles as err:
        raise HTTPException(400, str(err))
    from app.models import DriveFile

    return [_op_out(op, db.get(DriveFile, op.drive_file_id)) for op in ops]


@router.get("/operations", response_model=list[OperationOut])
def operations(db: Session = Depends(get_db)):
    return [_op_out(op, f) for op, f in cleanup_service.history(db, _account(db).id)]


@router.post("/operations/{op_id}/restore", response_model=OperationOut)
def restore(op_id: int, db: Session = Depends(get_db), client=Depends(get_drive_client)):
    from app.models import DriveFile

    try:
        op = cleanup_service.restore(db, _account(db).id, client, op_id)
    except LookupError as err:
        raise HTTPException(404, str(err))
    except ValueError as err:
        raise HTTPException(409, str(err))
    return _op_out(op, db.get(DriveFile, op.drive_file_id))
