import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.api import trash as trash_api
from app.core.database import SessionLocal
from app.main import app
from app.models import CleanupOperation, DriveAccount, DriveFile
from app.services import file_scanner, oauth_service
from app.services import trash_service as ts

NOW = datetime(2026, 11, 19, 12, 0, tzinfo=timezone.utc)


def mk(gid, size, days_ago=None, trashed=True, **kw):
    return DriveFile(
        google_file_id=gid, name=f"{gid}.jpg", mime_type=kw.pop("mime", "image/jpeg"), size=size, trashed=trashed,
        is_owned_by_user=kw.pop("owned", True),
        trashed_time=None if days_ago is None else NOW - timedelta(days=days_ago), **kw,
    )


@pytest.fixture
def env():
    db = SessionLocal()
    acc = DriveAccount(google_user_id=f"test-{uuid.uuid4()}", email="t@example.com", access_token="x")
    db.add(acc)
    db.commit()
    rows = [
        mk("fresh", 100, days_ago=1), mk("mid", 300, days_ago=15), mk("soon", 500, days_ago=25),
        mk("old-undated", 700),                                           # trashed, date unknown
        mk("live", 9999, trashed=False),                                  # not in Trash
        mk("theirs", 4000, days_ago=2, owned=False),                      # not yours: not your storage
        mk("dir", None, days_ago=3, mime="application/vnd.google-apps.folder"),
    ]
    for r in rows:
        r.account_id = acc.id
    db.add_all(rows)
    db.commit()
    yield db, acc
    db.delete(acc)
    db.commit()
    db.close()


def test_overview_counts_only_your_trashed_files(env):
    db, acc = env
    o = ts.overview(db, acc.id, now=NOW)
    assert (o["files"], o["bytes"], o["folders"]) == (4, 1600, 1)
    assert o["undated_files"] == 1
    assert (o["deleting_soon_files"], o["deleting_soon_bytes"]) == (1, 500)     # 25 days old: 5 days left
    assert o["oldest_trashed_at"] == NOW - timedelta(days=25)
    assert o["next_auto_delete_at"] == NOW - timedelta(days=25) + timedelta(days=30)


def test_items_sorting_and_paging(env):
    db, acc = env
    total, rows = ts.items(db, acc.id, "size")
    assert total == 4 and [f.google_file_id for f, _ in rows] == ["old-undated", "soon", "mid", "fresh"]
    _, rows = ts.items(db, acc.id, "deletes")
    assert [f.google_file_id for f, _ in rows] == ["soon", "mid", "fresh", "old-undated"]   # soonest first, unknown last
    _, rows = ts.items(db, acc.id, "name", page=2, page_size=3)
    assert len(rows) == 1


def test_trashed_by_app_flag(env):
    db, acc = env
    f = db.query(DriveFile).filter_by(account_id=acc.id, google_file_id="mid").one()
    db.add(CleanupOperation(account_id=acc.id, drive_file_id=f.id, operation_type="trash", status="completed"))
    db.commit()
    _, rows = ts.items(db, acc.id, "size")
    assert {x.google_file_id: bool(by) for x, by in rows} == {"old-undated": False, "soon": False, "mid": True, "fresh": False}


class TrashFeed:
    def __init__(self, files):
        self.files = files

    def list_trashed_page(self, token=None):
        i = int(token) if token else 0
        nxt = str(i + 2) if i + 2 < len(self.files) else None
        return self.files[i:i + 2], nxt


def test_refresh_dates_fills_unknown_dates_and_ignores_unknown_files(env):
    db, acc = env
    feed = TrashFeed([
        {"id": "old-undated", "trashedTime": "2026-11-10T08:00:00.000Z"},
        {"id": "fresh", "trashedTime": "2026-11-18T08:00:00.000Z"},
        {"id": "not-in-inventory", "trashedTime": "2026-11-01T00:00:00.000Z"},
    ])
    res = ts.refresh_dates(db, acc.id, feed)
    assert res == {"seen": 3, "updated": 2}
    db.expire_all()
    f = db.query(DriveFile).filter_by(account_id=acc.id, google_file_id="old-undated").one()
    assert f.trashed_time == datetime(2026, 11, 10, 8, 0, tzinfo=timezone.utc)
    assert ts.refresh_dates(db, acc.id, feed)["updated"] == 0                    # idempotent


def test_scanner_parses_trashed_time_and_clears_it_for_live_files():
    now = datetime.now(timezone.utc)
    t = file_scanner.parse_file({"id": "a", "name": "a", "mimeType": "image/png", "trashed": True,
                                 "trashedTime": "2026-11-10T08:00:00.000Z"}, now)
    assert t["trashed_time"] == datetime(2026, 11, 10, 8, 0, tzinfo=timezone.utc)
    live = file_scanner.parse_file({"id": "b", "name": "b", "mimeType": "image/png", "trashedTime": "stale"}, now)
    assert live["trashed_time"] is None


def test_api(env, monkeypatch):
    db, acc = env
    monkeypatch.setattr(oauth_service, "get_account", lambda _db: acc)
    app.dependency_overrides[trash_api.get_client] = lambda: TrashFeed([{"id": "mid", "trashedTime": "2026-11-17T00:00:00Z"}])
    try:
        c = TestClient(app)
        o = c.get("/api/trash/overview").json()
        assert o["files"] == 4 and o["drive_trash_url"].startswith("https://drive.google.com/")
        page = c.get("/api/trash/items?sort=size&page_size=2").json()
        assert page["total"] == 4 and len(page["items"]) == 2 and page["items"][0]["file"]["name"] == "old-undated.jpg"
        assert c.post("/api/trash/refresh-dates").json() == {"seen": 1, "updated": 1}
        assert c.get("/api/trash/items?sort=bogus").status_code == 422
    finally:
        app.dependency_overrides.clear()
