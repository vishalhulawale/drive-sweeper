import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.services import oauth_service

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.get("/google")
def google_login():
    url, _state, _verifier = oauth_service.build_authorization_url()
    return RedirectResponse(url)


@router.get("/google/callback")
def google_callback(request: Request, db: Session = Depends(get_db)):
    error = request.query_params.get("error")
    if error:
        return RedirectResponse(f"{settings.frontend_origin}/?auth_error={error}")
    state = request.query_params.get("state", "")
    found, verifier = oauth_service.pop_pending(state)
    if not found:
        log.warning("OAuth callback with unknown or expired state")
        raise HTTPException(
            400,
            "Unknown or expired login attempt (the server may have restarted, or this link was "
            "already used). Start again at /api/auth/google.",
        )
    try:
        oauth_service.complete_authorization(db, str(request.url), state, verifier)
    except Exception:
        log.exception("OAuth callback failed")
        return RedirectResponse(f"{settings.frontend_origin}/?auth_error=callback_failed")
    return RedirectResponse(f"{settings.frontend_origin}/")


@router.get("/status")
def status(db: Session = Depends(get_db)):
    account = oauth_service.get_account(db)
    if account is None:
        return {"connected": False, "email": None}
    return {"connected": True, "email": account.email}


@router.post("/disconnect")
def disconnect(db: Session = Depends(get_db)):
    account = oauth_service.get_account(db)
    if account is not None:
        oauth_service.disconnect(db, account)
    return {"connected": False}
