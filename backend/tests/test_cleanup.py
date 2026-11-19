import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.api.cleanup import get_drive_client
from app.core.database import SessionLocal
from app.main import app
from app.models import CleanupOperation, DriveAccount, DriveFile, DuplicateGroupFile
from app.services import cleanup_service as cs
from app.services import duplicate_detector as dd
from app.services import oauth_service
from app.services.google_drive import DriveError


class FakeDrive:
    """Stands in for DriveClient; holds a live view of each file."""

    def __init__(self, files):
        self.live = {f.google_file_id: {"id": f.google_file_id, "md5Checksum": f.md5_checksum, "trashed": False,
                                        "ownedByMe": True, "parents": ["P"], "capabilities": {"canTrash": True}}
                     for f in files}
        self.calls = []
        self.fail_on = set()

    def get_file(self, fid):
        return dict(self.live[fid])

    def set_trashed(self, fid, trashed):
        if fid in self.fail_on:
            raise DriveError("boom")
        self.calls.append((fid, trashed))
        self.live[fid]["trashed"] = trashed
        return self.live[fid]


def mk(gid, name, day):
    return DriveFile(
        google_file_id=gid, name=name, mime_type="image/png", size=100, md5_checksum="m1",
        created_time=datetime(2024, 1, day, tzinfo=timezone.utc), parent_ids=["P"],
    )


@pytest.fixture
def env():
    db = SessionLocal()
    acc = DriveAccount(google_user_id=f"test-{uuid.uuid4()}", email="t@example.com", access_token="x",
                       granted_scopes=oauth_service.TRASH_SCOPE)
    db.add(acc)
    db.commit()
    files = [mk("k", "keep.png", 1), mk("t1", "copy1.png", 2), mk("t2", "copy2.png", 3)]
    for f in files:
        f.account_id = acc.id
    db.add_all(files)
    db.commit()
    dd.rebuild(db, acc.id)
    yield db, acc, FakeDrive(files)
    db.delete(acc)
    db.commit()
    db.close()


def select_action(db, acc, names, action="trash"):
    rows = db.execute(
        select(DuplicateGroupFile, DriveFile).join(DriveFile, DriveFile.id == DuplicateGroupFile.drive_file_id)
        .where(DriveFile.account_id == acc.id)
    ).all()
    for entry, f in rows:
        if f.google_file_id in names:
            entry.user_selected_action = action
    db.commit()


def test_nothing_selected_means_empty_plan(env):
    db, acc, _ = env
    assert cs.build_plan(db, acc.id)["count"] == 0  # recommendations alone never trigger anything


def test_cannot_trash_every_copy(env):
    db, acc, drive = env
    select_action(db, acc, {"k", "t1", "t2"})
    plan = cs.build_plan(db, acc.id)
    assert plan["count"] == 0 and len(plan["blocked"]) == 1


def test_execute_trashes_only_selected_and_records_history(env):
    db, acc, drive = env
    select_action(db, acc, {"t1"})
    ops = cs.execute(db, acc.id, drive, expected_count=1)
    assert [(o.status, o.operation_type) for o in ops] == [("completed", "trash")]
    assert drive.calls == [("t1", True)]
    assert db.scalar(select(DriveFile.trashed).where(DriveFile.google_file_id == "t1")) is True
    assert ops[0].previous_parent_ids == ["P"]


def test_expected_count_mismatch_is_rejected(env):
    db, acc, drive = env
    select_action(db, acc, {"t1"})
    with pytest.raises(cs.PlanChanged):
        cs.execute(db, acc.id, drive, expected_count=2)
    assert drive.calls == []


def test_missing_keeper_blocks_group(env):
    db, acc, drive = env
    select_action(db, acc, {"t1"})
    drive.live["k"]["trashed"] = True  # keeper vanished since the scan
    ops = cs.execute(db, acc.id, drive, expected_count=1)
    assert ops[0].status == "skipped" and drive.calls == []


def test_changed_file_is_skipped(env):
    db, acc, drive = env
    select_action(db, acc, {"t1"})
    drive.live["t1"]["md5Checksum"] = "different"
    ops = cs.execute(db, acc.id, drive, expected_count=1)
    assert ops[0].status == "skipped" and drive.calls == []


def test_failure_is_recorded_and_others_continue(env):
    db, acc, drive = env
    select_action(db, acc, {"t1", "t2"})
    drive.fail_on = {"t1"}
    ops = cs.execute(db, acc.id, drive, expected_count=2)
    assert sorted(o.status for o in ops) == ["completed", "failed"]


def test_restore_round_trip(env):
    db, acc, drive = env
    select_action(db, acc, {"t1"})
    op = cs.execute(db, acc.id, drive, 1)[0]
    restored = cs.restore(db, acc.id, drive, op.id)
    assert restored.status == "completed" and restored.operation_type == "restore"
    assert drive.calls[-1] == ("t1", False)
    db.refresh(op)
    assert op.status == "restored"
    with pytest.raises(ValueError):
        cs.restore(db, acc.id, drive, op.id)  # cannot restore twice


def test_api_requires_trash_scope_and_confirms(env, monkeypatch):
    db, acc, drive = env
    monkeypatch.setattr(oauth_service, "get_account", lambda _db: acc)
    client = TestClient(app)
    select_action(db, acc, {"t1"})
    assert client.get("/api/cleanup/plan").json()["count"] == 1

    acc.granted_scopes = oauth_service.DRIVE_SCOPE  # read-only grant
    assert client.post("/api/cleanup/execute", json={"expected_count": 1}).status_code == 403

    acc.granted_scopes = oauth_service.TRASH_SCOPE
    app.dependency_overrides[get_drive_client] = lambda: drive
    try:
        assert client.post("/api/cleanup/execute", json={"expected_count": 5}).status_code == 409
        r = client.post("/api/cleanup/execute", json={"expected_count": 1})
        assert r.status_code == 200 and r.json()[0]["status"] == "completed"
        ops = client.get("/api/cleanup/operations").json()
        assert ops[0]["file_name"] == "copy1.png"
        assert client.post(f"/api/cleanup/operations/{ops[0]['id']}/restore").json()["status"] == "completed"
    finally:
        app.dependency_overrides.clear()
