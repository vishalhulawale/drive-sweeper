"""Google OAuth 2.0 flow and token persistence. No business logic lives in the routes."""
import os
from datetime import datetime, timezone

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decrypt, encrypt
from app.models import DriveAccount

# Read-only while scanning (least privilege). The broader "drive" scope is added in Phase 3.
SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/drive.metadata.readonly",
]

if settings.google_redirect_uri.startswith("http://localhost"):
    os.environ.setdefault("OAUTHLIB_INSECURE_TRANSPORT", "1")  # local development only
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")  # Google may reorder or add granted scopes


def _flow(state: str | None = None, code_verifier: str | None = None) -> Flow:
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=SCOPES,
        state=state,
        redirect_uri=settings.google_redirect_uri,
    )
    if code_verifier:
        flow.code_verifier = code_verifier
    return flow


def build_authorization_url() -> tuple[str, str, str | None]:
    """Returns (url, state, code_verifier). offline access + consent guarantees a refresh token."""
    flow = _flow()
    url, state = flow.authorization_url(
        access_type="offline", prompt="consent", include_granted_scopes="true"
    )
    return url, state, flow.code_verifier


def complete_authorization(
    db: Session, authorization_response: str, state: str, code_verifier: str | None
) -> DriveAccount:
    flow = _flow(state=state, code_verifier=code_verifier)
    flow.fetch_token(authorization_response=authorization_response)
    creds = flow.credentials
    info = google_id_token.verify_oauth2_token(
        creds.id_token, google_requests.Request(), settings.google_client_id
    )

    account = db.scalar(select(DriveAccount).where(DriveAccount.google_user_id == info["sub"]))
    expiry = creds.expiry.replace(tzinfo=timezone.utc) if creds.expiry else None
    if account is None:
        if not creds.refresh_token:
            raise ValueError("Google did not return a refresh token")
        account = DriveAccount(
            google_user_id=info["sub"],
            email=info.get("email", ""),
            access_token=encrypt(creds.token),
            refresh_token=encrypt(creds.refresh_token),
            token_expiry=expiry,
        )
        db.add(account)
    else:
        account.email = info.get("email", account.email)
        account.access_token = encrypt(creds.token)
        if creds.refresh_token:
            account.refresh_token = encrypt(creds.refresh_token)
        account.token_expiry = expiry
    db.commit()
    db.refresh(account)
    return account


def get_account(db: Session) -> DriveAccount | None:
    """Single-user for now: the first connected account."""
    return db.scalar(select(DriveAccount).order_by(DriveAccount.id).limit(1))


def credentials_for(account: DriveAccount) -> Credentials:
    expiry = account.token_expiry.astimezone(timezone.utc).replace(tzinfo=None) if account.token_expiry else None
    return Credentials(
        token=decrypt(account.access_token),
        refresh_token=decrypt(account.refresh_token) if account.refresh_token else None,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        scopes=SCOPES,
        expiry=expiry,
    )


def disconnect(db: Session, account: DriveAccount) -> None:
    """Revoke the token at Google (best effort) and delete local account data."""
    import httpx

    try:
        token = decrypt(account.refresh_token or account.access_token)
        httpx.post("https://oauth2.googleapis.com/revoke", params={"token": token}, timeout=10)
    except Exception:  # revocation failure must not block local disconnect
        pass
    db.delete(account)
    db.commit()
