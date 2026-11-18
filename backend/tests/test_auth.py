from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient
from sqlalchemy import inspect

from app.core.database import engine
from app.core.security import decrypt, encrypt
from app.main import app
from app.services import oauth_service

client = TestClient(app)


def test_token_encryption_roundtrip():
    token = "ya29.secret-token"
    enc = encrypt(token)
    assert enc != token
    assert decrypt(enc) == token


def test_status_not_connected_shape():
    body = client.get("/api/auth/status").json()
    assert set(body) == {"connected", "email"}


def test_login_redirects_to_google_with_offline_and_readonly_scope():
    r = client.get("/api/auth/google", follow_redirects=False)
    assert r.status_code in (302, 307)
    q = parse_qs(urlparse(r.headers["location"]).query)
    assert q["access_type"] == ["offline"]
    assert "drive.metadata.readonly" in q["scope"][0]
    assert "https://www.googleapis.com/auth/drive " not in q["scope"][0] + " "
    state = q["state"][0]
    assert oauth_service.pop_pending(state)[0] is True
    assert oauth_service.pop_pending(state)[0] is False  # single use


def test_callback_rejects_unknown_state():
    assert client.get("/api/auth/google/callback?state=x&code=y").status_code == 400


def test_schema_tables_exist():
    names = set(inspect(engine).get_table_names())
    assert {
        "drive_accounts", "drive_files", "duplicate_groups", "duplicate_group_files",
        "scan_jobs", "cleanup_operations", "sync_state",
    } <= names
