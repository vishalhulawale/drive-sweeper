import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.services import oauth_service

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

_COOKIE = {"httponly": True, "samesite": "lax", "max_age": 600}


@router.get("/google")
def google_login():
    url, state, verifier = oauth_service.build_authorization_url()
    resp = RedirectResponse(url)
    resp.set_cookie("oauth_state", state, **_COOKIE)
    if verifier:
        resp.set_cookie("oauth_verifier", verifier, **_COOKIE)
    return resp


@router.get("/google/callback")
def google_callback(request: Request, db: Session = Depends(get_db)):
    error = request.query_params.get("error")
    if error:
        return RedirectResponse(f"{settings.frontend_origin}/?auth_error={error}")
    state = request.cookies.get("oauth_state")
    if not state or state != request.query_params.get("state"):
        raise HTTPException(400, "Invalid OAuth state")
    try:
        oauth_service.complete_authorization(
            db, str(request.url), state, request.cookies.get("oauth_verifier")
        )
    except Exception:
        log.exception("OAuth callback failed")
        return RedirectResponse(f"{settings.frontend_origin}/?auth_error=callback_failed")
    resp = RedirectResponse(f"{settings.frontend_origin}/")
    resp.delete_cookie("oauth_state")
    resp.delete_cookie("oauth_verifier")
    return resp


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
