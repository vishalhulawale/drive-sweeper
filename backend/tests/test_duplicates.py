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


def test_apply_suggestions_never_crosses_kinds(seeded, monkeypatch):
    """'All groups' on the exact page must not mark similar (near) photos for Trash, and vice versa."""
    from app.main import app
    from app.models import DuplicateGroup
    from app.services import oauth_service

    db, acc = seeded
    monkeypatch.setattr(oauth_service, "get_account", lambda _db: acc)
    dd.rebuild(db, acc.id)
    f1, f2 = (db.scalar(select(DriveFile).where(DriveFile.account_id == acc.id, DriveFile.google_file_id == g))
              for g in ("c1", "f1"))
    near = DuplicateGroup(account_id=acc.id, detection_type="near", hash_algorithm="dhash", content_hash="ab",
                          file_count=2, total_size=101, potential_savings=1)
    db.add(near)
    db.flush()
    db.add_all([DuplicateGroupFile(duplicate_group_id=near.id, drive_file_id=f1.id, recommended_action="keep"),
                DuplicateGroupFile(duplicate_group_id=near.id, drive_file_id=f2.id, recommended_action="trash")])
    db.commit()

    def selections(kind):
        return [e.user_selected_action for e in db.scalars(
            select(DuplicateGroupFile).join(DuplicateGroup, DuplicateGroup.id == DuplicateGroupFile.duplicate_group_id)
            .where(DuplicateGroup.account_id == acc.id, DuplicateGroup.detection_type == kind)
            .execution_options(populate_existing=True))]

    c = TestClient(app)
    assert c.post("/api/duplicates/apply-suggestions", json={"all_groups": True}).status_code == 200
    assert "trash" in selections("exact")
    assert selections("near") == [None, None]  # untouched

    # A near group id sent with the default (exact) kind is ignored too.
    assert c.post("/api/duplicates/apply-suggestions", json={"group_ids": [near.id]}).status_code == 200
    assert selections("near") == [None, None]

    # Explicitly asking for near groups works, and leaves exact choices alone.
    for e in db.scalars(select(DuplicateGroupFile)):
        e.user_selected_action = None
    db.commit()
    assert c.post("/api/duplicates/apply-suggestions", json={"group_ids": [near.id], "kind": "near"}).status_code == 200
    assert sorted(selections("near")) == ["keep", "trash"]
    assert set(selections("exact")) == {None}
    assert c.post("/api/duplicates/apply-suggestions", json={"all_groups": True, "kind": "bogus"}).status_code == 422


def test_sha256_verifies_md5_groups(seeded):
    """Same MD5 + size is only a candidate; differing SHA-256 means different contents (an MD5 collision)."""
    db, acc = seeded
    files = {f.google_file_id: f for f in db.scalars(select(DriveFile).where(DriveFile.account_id == acc.id))}
    files["a1"].sha256_checksum = files["a2"].sha256_checksum = "s-same"
    files["a3"].sha256_checksum = "s-collision"
    db.commit()
    assert dd.rebuild(db, acc.id) == {"groups": 1, "duplicate_files": 2, "potential_savings": 100}
    from app.models import DuplicateGroup
    g = db.scalar(select(DuplicateGroup).where(DuplicateGroup.account_id == acc.id))
    assert g.hash_algorithm == "md5+sha256"
    members = set(db.scalars(select(DriveFile.google_file_id).join(
        DuplicateGroupFile, DuplicateGroupFile.drive_file_id == DriveFile.id).where(
        DuplicateGroupFile.duplicate_group_id == g.id)))
    assert members == {"a1", "a2"}

    files["a3"].sha256_checksum = None  # can't be verified against the others: left out
    db.commit()
    assert dd.rebuild(db, acc.id)["duplicate_files"] == 2
    files["a1"].sha256_checksum = files["a2"].sha256_checksum = None  # no SHA-256 anywhere: MD5 as before
    db.commit()
    assert dd.rebuild(db, acc.id)["duplicate_files"] == 3
