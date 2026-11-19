import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.api.cleanup import get_drive_client
from app.core.database import SessionLocal
from app.main import app
from app.models import CleanupOperation, DriveAccount, DriveFile
from app.services import oauth_service
from app.services import organizer_service as org
from app.services.google_drive import DriveError

FOLDER = "application/vnd.google-apps.folder"


def d(y, m, day):
    return datetime(y, m, day, tzinfo=timezone.utc)


def f(gid, name, parent, mime="image/jpeg", mod=None, **kw):
    kw.setdefault("is_owned_by_user", True)  # the DB default only applies on insert
    return DriveFile(google_file_id=gid, name=name, mime_type=mime, size=10, parent_folder_id=parent,
                     modified_time=mod, created_time=mod, parent_ids=[parent] if parent else None, **kw)


def trip_folder_rows():
    rows = [f("TRIP", "Goa 2024", None, FOLDER), f("DOCS", "Work", None, FOLDER)]
    rows += [f(f"t{i}", f"IMG_{i:04d}.jpg", "TRIP", mod=d(2024, 3, 1 + i)) for i in range(8)]
    rows += [f(f"w{i}", f"Report {i}.docx", "DOCS", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
               mod=d(2024, 3, 1 + i)) for i in range(6)]
    return rows


def test_stem_of():
    assert stem_of_cases() == ["img", "whatsapp image", "screenshot", ""]


def stem_of_cases():
    return [org.stem_of(n) for n in ("IMG_0877.HEIC", "WhatsApp Image 2026-03-18 at 3.34.jpeg", "Screenshot_2019.png", "20190101.png")]


def test_suggests_matching_folder_by_type_date_and_name():
    loose = f("L1", "IMG_0099.jpg", None, mod=d(2024, 3, 5))
    out = org.propose(trip_folder_rows() + [loose])
    assert [(o["file"].google_file_id, o["folder_name"]) for o in out] == [("L1", "Goa 2024")]
    assert out[0]["confidence"] == "high" and len(out[0]["reasons"]) == 3


def test_no_suggestion_when_type_or_date_do_not_fit():
    far = f("L2", "IMG_1.jpg", None, mod=d(2019, 1, 1))                 # years away from the trip
    doc = f("L3", "x.docx", None, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", mod=d(2024, 3, 3))
    video = f("L4", "clip.mp4", None, "video/mp4", mod=d(2024, 3, 3))   # no video folder
    out = org.propose(trip_folder_rows() + [far, video])
    assert out == []
    assert [o["folder_name"] for o in org.propose(trip_folder_rows() + [doc])] == ["Work"]


def test_small_folders_and_filed_files_are_ignored():
    rows = trip_folder_rows()
    already = [r for r in rows if r.google_file_id == "t1"][0]
    assert org.propose(rows) == []          # nothing is loose
    few = [f("S", "Tiny", None, FOLDER)] + [f(f"s{i}", f"a{i}.jpg", "S", mod=d(2024, 3, 3)) for i in range(3)]
    assert org.propose(few + [f("L", "b.jpg", None, mod=d(2024, 3, 3))]) == []
    assert already.parent_folder_id == "TRIP"


def test_files_in_shared_folders_and_shared_files_are_not_loose():
    shared = f("SH", "Shared by boss", None, FOLDER, is_owned_by_user=False)
    inside = f("L6", "IMG_6.jpg", "SH", mod=d(2024, 3, 4))                     # already filed in a shared folder
    not_mine = f("L7", "IMG_7.jpg", None, mod=d(2024, 3, 4), is_owned_by_user=False)
    assert org.propose(trip_folder_rows() + [shared, inside, not_mine]) == []


def test_custom_source_folder():
    rows = trip_folder_rows() + [f("DUMP", "Dump", None, FOLDER), f("L5", "IMG_5.jpg", "DUMP", mod=d(2024, 3, 4))]
    assert org.propose(rows) == []                              # not top level
    out = org.propose(rows, source="DUMP")
    assert out and out[0]["folder_name"] == "Goa 2024"


class FakeDrive:
    def __init__(self):
        self.live = {}
        self.moves = []
        self.fail = False

    def add(self, gid, parents, owned=True, trashed=False, can_move=True):
        self.live[gid] = {"id": gid, "parents": list(parents), "ownedByMe": owned, "trashed": trashed,
                          "capabilities": {"canMoveItemWithinDrive": can_move}}

    def get_file(self, gid):
        return dict(self.live[gid])

    def move_file(self, gid, add_parent, remove_parents, extra_add=None):
        if self.fail:
            raise DriveError("boom")
        self.moves.append((gid, add_parent, tuple(remove_parents)))
        self.live[gid]["parents"] = [add_parent, *(extra_add or [])]
        return self.live[gid]


@pytest.fixture
def env():
    db = SessionLocal()
    acc = DriveAccount(google_user_id=f"test-{uuid.uuid4()}", email="t@example.com", access_token="x",
                       granted_scopes=oauth_service.TRASH_SCOPE)
    db.add(acc)
    db.commit()
    rows = trip_folder_rows() + [f("L1", "IMG_0099.jpg", "OLD", mod=d(2024, 3, 5))]
    for r in rows:
        r.account_id = acc.id
    db.add_all(rows)
    db.commit()
    drive = FakeDrive()
    drive.add("TRIP", [])
    drive.add("L1", ["OLD"])
    yield db, acc, drive
    db.delete(acc)
    db.commit()
    db.close()


def test_move_then_undo_round_trip(env):
    db, acc, drive = env
    op = org.apply_moves(db, acc.id, drive, [{"file_id": "L1", "folder_id": "TRIP"}])[0]
    assert op.status == "completed" and drive.moves == [("L1", "TRIP", ("OLD",))]
    assert op.previous_parent_ids == ["OLD"]
    row = db.scalar(select(DriveFile).where(DriveFile.google_file_id == "L1", DriveFile.account_id == acc.id))
    assert row.parent_folder_id == "TRIP"
    undo = org.undo(db, acc.id, drive, op.id)
    assert undo.status == "completed" and undo.operation_type == "unmove"
    db.refresh(row)
    assert row.parent_folder_id == "OLD" and drive.live["L1"]["parents"] == ["OLD"]
    db.refresh(op)
    assert op.status == "undone"
    with pytest.raises(ValueError):
        org.undo(db, acc.id, drive, op.id)


def test_unsafe_moves_are_skipped_not_executed(env):
    db, acc, drive = env
    drive.live["L1"]["ownedByMe"] = False
    assert org.apply_moves(db, acc.id, drive, [{"file_id": "L1", "folder_id": "TRIP"}])[0].status == "skipped"
    drive.live["L1"]["ownedByMe"] = True
    drive.live["TRIP"]["trashed"] = True
    assert org.apply_moves(db, acc.id, drive, [{"file_id": "L1", "folder_id": "TRIP"}])[0].status == "skipped"
    drive.live["TRIP"]["trashed"] = False
    drive.live["L1"]["capabilities"]["canMoveItemWithinDrive"] = False
    assert org.apply_moves(db, acc.id, drive, [{"file_id": "L1", "folder_id": "TRIP"}])[0].status == "skipped"
    drive.live["L1"]["capabilities"]["canMoveItemWithinDrive"] = True
    assert org.apply_moves(db, acc.id, drive, [{"file_id": "L1", "folder_id": "L1"}])[0].status == "skipped"  # not a folder
    assert drive.moves == []


def test_failure_recorded_and_limit_enforced(env):
    db, acc, drive = env
    drive.fail = True
    assert org.apply_moves(db, acc.id, drive, [{"file_id": "L1", "folder_id": "TRIP"}])[0].status == "failed"
    with pytest.raises(org.TooManyMoves):
        org.apply_moves(db, acc.id, drive, [{"file_id": "L1", "folder_id": "TRIP"}] * (org.MAX_MOVES + 1))
    with pytest.raises(LookupError):
        org.apply_moves(db, acc.id, drive, [{"file_id": "nope", "folder_id": "TRIP"}])


def test_api(env, monkeypatch):
    db, acc, drive = env
    monkeypatch.setattr(oauth_service, "get_account", lambda _db: acc)
    app.dependency_overrides[get_drive_client] = lambda: drive
    try:
        c = TestClient(app)
        s = c.get("/api/organizer/suggestions?source=OLD").json()
        assert s["items"][0]["folder_name"] == "Goa 2024"
        r = c.post("/api/organizer/apply", json={"moves": [{"file_id": "L1", "folder_id": "TRIP"}]})
        assert r.status_code == 200 and r.json()[0]["operation_type"] == "move"
        h = c.get("/api/organizer/history").json()
        assert h[0]["status"] == "completed"
        assert c.post(f"/api/organizer/operations/{h[0]['id']}/undo").json()["operation_type"] == "unmove"
        assert c.post("/api/organizer/apply", json={"moves": []}).status_code == 422
    finally:
        app.dependency_overrides.clear()


def _loose_files(db, acc, drive, n):
    rows = [f(f"N{i}", f"IMG_{i:04d}.jpg", "OLD", mod=d(2024, 3, 5)) for i in range(n)]
    for r in rows:
        r.account_id = acc.id
        drive.add(r.google_file_id, ["OLD"])
    db.add_all(rows)
    db.commit()
    return [{"file_id": r.google_file_id, "folder_id": "TRIP"} for r in rows]


def test_batch_checks_the_folder_once_and_each_file_once(env):
    db, acc, drive = env
    moves = _loose_files(db, acc, drive, 12)
    fetched = []
    get = drive.get_file
    drive.get_file = lambda gid: (fetched.append(gid), get(gid))[1]
    ops = org.apply_moves(db, acc.id, drive, moves)
    assert [o.status for o in ops] == ["completed"] * 12
    assert fetched.count("TRIP") == 1                       # was once per move
    assert sorted(g for g in fetched if g != "TRIP") == sorted(m["file_id"] for m in moves)   # once each (was twice)


def test_unknown_file_in_a_batch_changes_nothing(env):
    db, acc, drive = env
    moves = _loose_files(db, acc, drive, 3)
    before = db.scalar(select(func.count()).select_from(CleanupOperation).where(CleanupOperation.account_id == acc.id))
    with pytest.raises(LookupError):
        org.apply_moves(db, acc.id, drive, moves + [{"file_id": "nope", "folder_id": "TRIP"}])
    assert drive.moves == []
    assert db.scalar(select(func.count()).select_from(CleanupOperation)
                     .where(CleanupOperation.account_id == acc.id)) == before


def test_moves_run_in_parallel(env):
    import threading
    import time

    db, acc, drive = env
    moves = _loose_files(db, acc, drive, 20)
    lock, state = threading.Lock(), {"active": 0, "peak": 0}
    move = drive.move_file

    def slow_move(*a, **kw):
        with lock:
            state["active"] += 1
            state["peak"] = max(state["peak"], state["active"])
        time.sleep(0.02)
        with lock:
            state["active"] -= 1
        return move(*a, **kw)

    drive.move_file = slow_move
    assert all(o.status == "completed" for o in org.apply_moves(db, acc.id, drive, moves))
    assert state["peak"] > 1
