import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.api.sync import get_client
from app.core.database import SessionLocal
from app.main import app
from app.models import DriveAccount, DriveFile, DuplicateGroup, ScanJob, SyncState
from app.repositories import scan_repository as scans
from app.services import file_scanner, oauth_service, sync_service
from app.services.google_drive import DriveError, InvalidPageToken


def raw(gid, name="a.png", md5="m1", size="100", **kw):
    d = {"id": gid, "name": name, "mimeType": "image/png", "size": size, "md5Checksum": md5,
         "parents": ["P"], "ownedByMe": True, "createdTime": "2024-01-02T03:04:05.000Z",
         "modifiedTime": "2024-02-02T03:04:05.000Z"}
    d.update(kw)
    return d


class FakeChanges:
    """pages: list of change lists; the feed serves them as tokens c0, c1, ... then a new start token."""

    def __init__(self, pages, bad_token=None, fail_on_page=None):
        self.pages, self.bad_token, self.fail_on_page = pages, bad_token, fail_on_page
        self.requested = []

    def get_start_page_token(self):
        return "base"

    def list_changes_page(self, token):
        self.requested.append(token)
        if token == self.bad_token:
            raise InvalidPageToken("gone")
        idx = int(token[1:]) if token.startswith("c") else 0
        if self.fail_on_page == idx:
            self.fail_on_page = None
            raise DriveError("transient")
        nxt = f"c{idx + 1}" if idx + 1 < len(self.pages) else None
        return self.pages[idx], nxt, (None if nxt else "new-start")


@pytest.fixture
def env():
    db = SessionLocal()
    acc = DriveAccount(google_user_id=f"test-{uuid.uuid4()}", email="t@example.com", access_token="x")
    db.add(acc)
    db.commit()
    now = file_scanner.datetime.now(file_scanner.timezone.utc)
    rows = [file_scanner.parse_file(raw(g, name=g), now) for g in ("a", "b", "c")]
    db.add_all([DriveFile(account_id=acc.id, **r) for r in rows])
    db.add(SyncState(account_id=acc.id, changes_page_token="c0"))
    db.commit()
    yield db, acc
    db.delete(acc)
    db.commit()
    db.close()


def names(db, acc):
    return {f.google_file_id: f for f in db.scalars(select(DriveFile).where(DriveFile.account_id == acc.id))}


def test_applies_updates_new_files_trash_and_removals(env):
    db, acc = env
    feed = FakeChanges([[
        {"fileId": "a", "file": raw("a", name="renamed.png")},
        {"fileId": "b", "removed": True},
        {"fileId": "c", "file": raw("c", trashed=True)},
        {"fileId": "d", "file": raw("d", name="brand-new.png", md5="m9")},
    ]])
    res = sync_service.sync(db, acc.id, feed)
    assert (res["updated"], res["removed"]) == (3, 1)
    rows = names(db, acc)
    assert set(rows) == {"a", "c", "d"}
    assert rows["a"].name == "renamed.png" and rows["c"].trashed is True and rows["d"].name == "brand-new.png"
    db.expire_all()
    assert sync_service.get_state(db, acc.id).changes_page_token == "new-start"


def test_last_change_for_a_file_wins(env):
    db, acc = env
    feed = FakeChanges([[
        {"fileId": "a", "file": raw("a", name="first.png")},
        {"fileId": "a", "removed": True},
        {"fileId": "b", "removed": True},
        {"fileId": "b", "file": raw("b", name="back.png")},
    ]])
    sync_service.sync(db, acc.id, feed)
    rows = names(db, acc)
    assert "a" not in rows and rows["b"].name == "back.png"


def test_sync_is_idempotent(env):
    db, acc = env
    page = [{"fileId": "a", "file": raw("a", name="x.png")}]
    sync_service.sync(db, acc.id, FakeChanges([page]))
    state = sync_service.get_state(db, acc.id)
    state.changes_page_token = "c0"  # replay the same changes
    db.commit()
    sync_service.sync(db, acc.id, FakeChanges([page]))
    assert names(db, acc)["a"].name == "x.png" and len(names(db, acc)) == 3


def test_interrupted_multi_page_sync_resumes_without_skipping(env):
    db, acc = env
    pages = [[{"fileId": "a", "file": raw("a", name="p0.png")}], [{"fileId": "b", "file": raw("b", name="p1.png")}]]
    feed = FakeChanges(pages, fail_on_page=1)
    with pytest.raises(DriveError):
        sync_service.sync(db, acc.id, feed)
    db.expire_all()
    state = sync_service.get_state(db, acc.id)
    assert state.changes_page_token == "c1" and state.sync_status == "failed"   # page 0 saved, page 1 pending
    assert names(db, acc)["a"].name == "p0.png"
    sync_service.sync(db, acc.id, FakeChanges(pages))                            # resumes at c1
    assert names(db, acc)["b"].name == "p1.png"
    assert sync_service.get_state(db, acc.id).changes_page_token == "new-start"


def test_expired_bookmark_requires_full_scan(env):
    db, acc = env
    with pytest.raises(sync_service.SyncUnavailable):
        sync_service.sync(db, acc.id, FakeChanges([[]], bad_token="c0"))
    assert sync_service.status(db, acc.id)["available"] is False


def test_no_baseline_and_active_scan_are_refused(env):
    db, acc = env
    sync_service.get_state(db, acc.id).changes_page_token = None
    db.commit()
    with pytest.raises(sync_service.SyncUnavailable):
        sync_service.sync(db, acc.id, FakeChanges([[]]))
    sync_service.get_state(db, acc.id).changes_page_token = "c0"
    scans.create(db, acc.id)  # pending scan counts as active
    with pytest.raises(sync_service.ScanActive):
        sync_service.sync(db, acc.id, FakeChanges([[]]))


def test_duplicates_are_rebuilt_after_changes(env):
    db, acc = env
    feed = FakeChanges([[{"fileId": "a", "file": raw("a")}, {"fileId": "b", "file": raw("b")}]])  # same md5+size
    sync_service.sync(db, acc.id, feed)
    assert db.scalar(select(DuplicateGroup).where(DuplicateGroup.account_id == acc.id)) is not None


class ScanClient:
    def __init__(self, fail_token=False):
        self.fail_token = fail_token

    def get_start_page_token(self):
        if self.fail_token:
            raise DriveError("no")
        return "baseline-xyz"

    def list_files_page(self, token=None):
        return [raw("only")], None


def test_full_scan_publishes_baseline_taken_at_start():
    db = SessionLocal()
    acc = DriveAccount(google_user_id=f"test-{uuid.uuid4()}", email="t@example.com", access_token="x")
    db.add(acc)
    db.commit()
    try:
        job = file_scanner.run_scan(db, ScanClient(), scans.create(db, acc.id))
        assert job.status == "completed" and job.changes_start_token == "baseline-xyz"
        assert sync_service.get_state(db, acc.id).changes_page_token == "baseline-xyz"
        # A baseline failure must not break the scan, and must not clobber the existing bookmark.
        job2 = file_scanner.run_scan(db, ScanClient(fail_token=True), scans.create(db, acc.id))
        assert job2.status == "completed" and job2.changes_start_token is None
        assert sync_service.get_state(db, acc.id).changes_page_token == "baseline-xyz"
    finally:
        db.delete(acc)
        db.commit()
        db.close()


def test_api(env, monkeypatch):
    db, acc = env
    monkeypatch.setattr(oauth_service, "get_account", lambda _db: acc)
    feed = FakeChanges([[{"fileId": "a", "file": raw("a", name="via-api.png")}]])
    app.dependency_overrides[get_client] = lambda: feed
    try:
        c = TestClient(app)
        assert c.get("/api/sync/status").json()["available"] is True
        r = c.post("/api/sync")
        assert r.status_code == 200 and r.json()["updated"] == 1
        sync_service.get_state(db, acc.id).changes_page_token = None
        db.commit()
        assert c.post("/api/sync").status_code == 409
    finally:
        app.dependency_overrides.clear()
