import json
import uuid
from datetime import datetime, timezone

import httplib2
import pytest
from googleapiclient.errors import HttpError
from sqlalchemy import func, select

from app.core.database import SessionLocal
from app.models import DriveAccount, DriveFile, ScanJob
from app.repositories import scan_repository as scans
from app.services import file_scanner
from app.services.google_drive import DriveClient, DriveError, InvalidPageToken


def http_error(status: int, reason: str = "") -> HttpError:
    body = json.dumps({"error": {"errors": [{"reason": reason}]}}).encode()
    return HttpError(httplib2.Response({"status": status}), body)


def raw(i: int, **kw) -> dict:
    d = {"id": f"f{i}", "name": f"file{i}", "mimeType": "image/png", "size": "100",
         "md5Checksum": f"md5{i}", "parents": ["root1"], "ownedByMe": True,
         "createdTime": "2024-01-02T03:04:05.000Z", "modifiedTime": "2024-02-02T03:04:05.000Z"}
    d.update(kw)
    return d


class FakeClient:
    """pages: list of file lists. Tokens are 't1', 't2', ...; failures: {call_number: exception}."""

    def __init__(self, pages, failures=None, bad_tokens=(), keep_bad=False):
        self.keep_bad = keep_bad
        self.pages, self.failures, self.bad_tokens = pages, failures or {}, set(bad_tokens)
        self.calls = []

    def get_start_page_token(self):
        return "baseline-1"

    def list_files_page(self, token=None):
        self.calls.append(token)
        n = len(self.calls)
        if n in self.failures:
            raise self.failures[n]
        if token in self.bad_tokens:
            if not self.keep_bad:
                self.bad_tokens.discard(token)  # expires once, like a real stale checkpoint
            raise InvalidPageToken("expired")
        idx = int(token[1:]) if token else 0
        nxt = f"t{idx + 1}" if idx + 1 < len(self.pages) else None
        return self.pages[idx], nxt


@pytest.fixture
def db():
    s = SessionLocal()
    yield s
    s.rollback()
    s.close()


@pytest.fixture
def account(db):
    acc = DriveAccount(google_user_id=f"test-{uuid.uuid4()}", email="t@example.com", access_token="x")
    db.add(acc)
    db.commit()
    yield acc
    db.delete(acc)
    db.commit()


def count(db, acc):
    return db.scalar(select(func.count()).select_from(DriveFile).where(DriveFile.account_id == acc.id))


def test_parse_file_variants():
    now = datetime.now(timezone.utc)
    doc = file_scanner.parse_file({"id": "d", "name": "Doc", "mimeType": "application/vnd.google-apps.document"}, now)
    assert doc["size"] is None and doc["md5_checksum"] is None and doc["parent_folder_id"] is None
    sc = file_scanner.parse_file(
        {"id": "s", "mimeType": "application/vnd.google-apps.shortcut", "shortcutDetails": {"targetId": "T"}}, now)
    assert sc["is_shortcut"] and sc["shortcut_target_id"] == "T"
    f = file_scanner.parse_file(raw(1, parents=["a", "b"]), now)
    assert f["size"] == 100 and f["parent_folder_id"] == "a" and f["parent_ids"] == ["a", "b"]
    assert f["is_owned_by_user"] is True and f["created_time"].year == 2024


def test_full_scan_persists_and_is_idempotent(db, account):
    pages = [[raw(1), raw(2)], [raw(3)]]
    job = scans.create(db, account.id)
    file_scanner.run_scan(db, FakeClient(pages), job)
    assert job.status == "completed" and job.processed_files == 3 and job.total_files == 3
    assert job.next_page_token is None and count(db, account) == 3

    job2 = scans.create(db, account.id)
    file_scanner.run_scan(db, FakeClient(pages), job2)
    assert count(db, account) == 3  # re-scan does not duplicate rows


def test_crash_mid_scan_then_resume_from_checkpoint(db, account):
    pages = [[raw(1)], [raw(2)], [raw(3)]]
    job = scans.create(db, account.id)
    file_scanner.run_scan(db, FakeClient(pages, failures={3: DriveError("boom")}), job)
    assert job.status == "failed" and "boom" in job.error_message
    assert job.next_page_token == "t2" and job.processed_files == 2 and count(db, account) == 2

    client = FakeClient(pages)
    file_scanner.run_scan(db, client, job)
    assert client.calls[0] == "t2"  # resumed, did not start over
    assert job.status == "completed" and count(db, account) == 3


def test_expired_page_token_restarts_listing(db, account):
    pages = [[raw(1)], [raw(2)]]
    job = scans.create(db, account.id)
    job.next_page_token = "t1"
    job.processed_files = 1
    db.commit()
    client = FakeClient(pages, bad_tokens={"t1"})
    file_scanner.run_scan(db, client, job)
    assert client.calls[:2] == ["t1", None]
    assert job.status == "completed" and count(db, account) == 2


def test_perpetually_expiring_token_fails_instead_of_looping(db, account):
    job = scans.create(db, account.id)
    job.next_page_token = "t1"
    db.commit()
    file_scanner.run_scan(db, FakeClient([[raw(1)], [raw(2)]], bad_tokens={"t1"}, keep_bad=True), job)
    assert job.status == "failed" and "expiring" in job.error_message


def test_stale_files_removed_after_complete_scan(db, account):
    file_scanner.run_scan(db, FakeClient([[raw(1), raw(2)]]), scans.create(db, account.id))
    file_scanner.run_scan(db, FakeClient([[raw(1)]]), scans.create(db, account.id))
    names = set(db.scalars(select(DriveFile.google_file_id).where(DriveFile.account_id == account.id)))
    assert names == {"f1"}


def test_cancelled_scan_stops_and_keeps_status(db, account):
    job = scans.create(db, account.id)

    class CancellingClient(FakeClient):
        def list_files_page(self, token=None):
            result = super().list_files_page(token)
            with SessionLocal() as other:  # cancel from "another request" after the first page
                other.get(ScanJob, job.id).status = "cancelled"
                other.commit()
            return result

    file_scanner.run_scan(db, CancellingClient([[raw(1)], [raw(2)]]), job)
    assert job.status == "cancelled" and count(db, account) == 1


def test_sha256_comes_from_drive_and_follows_content_changes(db, account):
    file_scanner.run_scan(db, FakeClient([[raw(1, sha256Checksum="s-old")]]), scans.create(db, account.id))
    row = db.scalar(select(DriveFile).where(DriveFile.account_id == account.id))
    assert row.sha256_checksum == "s-old"
    file_scanner.run_scan(db, FakeClient([[raw(1, md5Checksum="new", sha256Checksum="s-new")]]),
                          scans.create(db, account.id))
    db.refresh(row)
    assert (row.md5_checksum, row.sha256_checksum) == ("new", "s-new")


# --- DriveClient retry behaviour -------------------------------------------------------------

class _Req:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)

    def execute(self):
        o = self.outcomes.pop(0)
        if isinstance(o, Exception):
            raise o
        return o


class _Service:
    def __init__(self, outcomes):
        self.req = _Req(outcomes)

    def files(self):
        return self

    def list(self, **_kw):
        return self.req


def test_client_retries_rate_limit_then_succeeds():
    sleeps = []
    svc = _Service([http_error(403, "rateLimitExceeded"), http_error(503), {"files": [raw(1)], "nextPageToken": "n"}])
    files, nxt = DriveClient(None, sleep=sleeps.append, service=svc).list_files_page()
    assert len(files) == 1 and nxt == "n" and len(sleeps) == 2
    assert sleeps[1] > sleeps[0] - 1  # exponential growth (jitter < 1s)


def test_client_does_not_retry_permission_errors():
    svc = _Service([http_error(403, "insufficientPermissions")])
    with pytest.raises(DriveError, match="permission not granted"):
        DriveClient(None, sleep=lambda _: None, service=svc).list_files_page()


def test_client_gives_up_after_max_attempts():
    svc = _Service([http_error(500)] * 10)
    with pytest.raises(DriveError):
        DriveClient(None, sleep=lambda _: None, service=svc).list_files_page()


def test_client_signals_invalid_page_token():
    svc = _Service([http_error(400, "invalid")])
    with pytest.raises(InvalidPageToken):
        DriveClient(None, sleep=lambda _: None, service=svc).list_files_page("stale")


def test_client_retries_network_errors_then_succeeds():
    sleeps = []
    svc = _Service([TimeoutError("The read operation timed out"), ConnectionResetError(),
                    httplib2.ServerNotFoundError("dns"), {"files": [raw(1)]}])
    files, nxt = DriveClient(None, sleep=sleeps.append, service=svc).list_files_page()
    assert len(files) == 1 and nxt is None and len(sleeps) == 3


def test_client_reports_a_persistent_network_error_as_drive_error():
    svc = _Service([TimeoutError("timed out")] * 10)
    with pytest.raises(DriveError, match="Network error"):
        DriveClient(None, sleep=lambda _: None, service=svc).list_files_page()


def test_thumbnail_fetch_retries_network_errors():
    class FlakyHttp:
        def __init__(self, outcomes):
            self.outcomes = list(outcomes)

        def request(self, url, method):
            o = self.outcomes.pop(0)
            if isinstance(o, Exception):
                raise o
            return o

    client = DriveClient(None, sleep=lambda _: None, service=_Service([]))
    client._local.http = FlakyHttp([TimeoutError(), (httplib2.Response({"status": 200}), b"img")])
    assert client.fetch_thumbnail("https://x/thumb=s220") == b"img"
    client._local.http = FlakyHttp([TimeoutError()] * 3)
    with pytest.raises(DriveError, match="Thumbnail request failed"):
        client.fetch_thumbnail("https://x/thumb=s220")


def test_completed_scan_regroups_duplicates(db, account):
    from app.models import DuplicateGroup

    def groups():
        return db.scalar(select(func.count()).select_from(DuplicateGroup).where(DuplicateGroup.account_id == account.id))

    file_scanner.run_scan(db, FakeClient([[raw(1, md5Checksum="same"), raw(2, md5Checksum="same")]]),
                          scans.create(db, account.id))
    assert groups() == 1  # no separate "Find duplicates" click needed
    # A later scan in which the copy is gone removes the stale group again.
    file_scanner.run_scan(db, FakeClient([[raw(1, md5Checksum="same")]]), scans.create(db, account.id))
    assert groups() == 0


def test_failed_scan_leaves_groups_alone(db, account, monkeypatch):
    from app.services import duplicate_detector

    called = []
    monkeypatch.setattr(duplicate_detector, "refresh_all", lambda *a: called.append(a))
    job = file_scanner.run_scan(db, FakeClient([[raw(1)]], failures={1: DriveError("down")}), scans.create(db, account.id))
    assert job.status == "failed" and called == []
