import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.database import SessionLocal
from app.models import DriveAccount, DriveFile, DuplicateGroupFile
from app.services import duplicate_detector as dd


def mk(gid, name, md5, size=100, day=1, **kw):
    return DriveFile(
        google_file_id=gid, name=name, mime_type="image/png", size=size, md5_checksum=md5,
        created_time=datetime(2024, 1, day, tzinfo=timezone.utc), **kw,
    )


@pytest.fixture
def seeded():
    db = SessionLocal()
    acc = DriveAccount(google_user_id=f"test-{uuid.uuid4()}", email="t@example.com", access_token="x")
    db.add(acc)
    db.commit()
    rows = [
        mk("a1", "photo.png", "m1", day=5), mk("a2", "photo copy.png", "m1", day=2),
        mk("a3", "photo (1).png", "m1", day=9),
        mk("b1", "doc.png", "m2", size=50), mk("b2", "doc2.png", "m2", size=50, trashed=True),  # trashed
        mk("c1", "x.png", "m3"), mk("c2", "shared.png", "m3", is_owned_by_user=False),          # not owned
        mk("d1", "e1", "m4", size=0), mk("d2", "e2", "m4", size=0),                             # empty
        mk("f1", "same-hash-size1", "m5", size=1), mk("f2", "same-hash-size2", "m5", size=2),   # diff size
    ]
    for r in rows:
        r.account_id = acc.id
    db.add_all(rows)
    db.commit()
    yield db, acc
    db.delete(acc)
    db.commit()
    db.close()


def test_detect_groups_and_exclusions(seeded):
    db, acc = seeded
    assert dd.rebuild(db, acc.id) == {"groups": 1, "duplicate_files": 3, "potential_savings": 200}


def test_keeper_is_oldest(seeded):
    db, acc = seeded
    dd.rebuild(db, acc.id)
    rows = db.execute(
        select(DriveFile.google_file_id, DuplicateGroupFile.recommended_action).join(
            DriveFile, DriveFile.id == DuplicateGroupFile.drive_file_id
        ).where(DriveFile.account_id == acc.id)
    ).all()
    assert dict(rows) == {"a2": "keep", "a1": "trash", "a3": "trash"}


def test_rebuild_preserves_user_selection(seeded):
    db, acc = seeded
    dd.rebuild(db, acc.id)
    entry = db.scalars(
        select(DuplicateGroupFile).join(DriveFile, DriveFile.id == DuplicateGroupFile.drive_file_id)
        .where(DriveFile.account_id == acc.id)
    ).first()
    fid = entry.drive_file_id
    entry.user_selected_action = "keep"
    db.commit()
    assert dd.rebuild(db, acc.id)["groups"] == 1
    again = db.scalars(select(DuplicateGroupFile).where(DuplicateGroupFile.drive_file_id == fid)).one()
    assert again.user_selected_action == "keep"


def test_api_endpoints(seeded, monkeypatch):
    from app.main import app
    from app.services import oauth_service

    db, acc = seeded
    monkeypatch.setattr(oauth_service, "get_account", lambda _db: acc)
    c = TestClient(app)
    assert c.post("/api/duplicates/detect").json()["groups"] == 1
    page = c.get("/api/duplicates").json()
    assert page["total"] == 1
    g = page["items"][0]
    assert g["file_size"] == 100 and len(g["files"]) == 3
    entry = g["files"][0]["entry_id"]
    r = c.put(f"/api/duplicates/entries/{entry}/selection", json={"action": "trash"})
    assert r.json()["user_selected_action"] == "trash"
    assert c.put(f"/api/duplicates/entries/{entry}/selection", json={"action": "delete"}).status_code == 422
    assert c.post("/api/duplicates/apply-suggestions", json={"group_ids": [g["id"]]}).status_code == 200
    after = c.get(f"/api/duplicates/{g['id']}").json()["files"]
    assert all(f["user_selected_action"] == f["recommended_action"] for f in after)
    assert c.post("/api/duplicates/apply-suggestions", json={}).status_code == 422
    assert c.post("/api/duplicates/apply-suggestions", json={"all_groups": True}).status_code == 200
    by_id = {f["file"]["google_file_id"]: f["user_selected_action"]
             for f in c.get(f"/api/duplicates/{g['id']}").json()["files"]}
    assert by_id == {"a2": "keep", "a1": "trash", "a3": "trash"}  # oldest kept, newer trashed
    assert c.get(f"/api/duplicates/{g['id']}").status_code == 200
    assert c.get("/api/duplicates/999999").status_code == 404
