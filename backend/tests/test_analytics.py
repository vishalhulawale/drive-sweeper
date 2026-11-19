import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.core.database import SessionLocal
from app.main import app
from app.models import DriveAccount, DriveFile
from app.services import analytics_service as svc
from app.services import oauth_service

FOLDER = svc.FOLDER


def f(gid, name, parent, mime="image/png", size=10, year=2024, **kw):
    return DriveFile(
        google_file_id=gid, name=name, mime_type=mime, size=size, parent_folder_id=parent,
        created_time=datetime(year, 6, 1, tzinfo=timezone.utc), **kw,
    )


@pytest.fixture
def seeded():
    db = SessionLocal()
    acc = DriveAccount(google_user_id=f"test-{uuid.uuid4()}", email="t@example.com", access_token="x")
    db.add(acc)
    db.commit()
    rows = [
        f("A", "Photos", None, FOLDER, None), f("B", "Trips", "A", FOLDER, None),
        f("p1", "a.png", "B", size=100), f("p2", "b.png", "A", size=50, year=2022),
        f("v1", "clip.mp4", "B", "video/mp4", 1000),
        f("d1", "doc.pdf", None, "application/pdf", 20),
        f("z1", "bk.zip", None, "application/zip", 30),
        f("t1", "old.png", "A", size=999, trashed=True),                        # trash: reported separately
        f("s1", "shared.mp4", "A", "video/mp4", 5000, is_owned_by_user=False),  # not my quota
        f("g1", "Doc", "A", "application/vnd.google-apps.document", None),
        f("o1", "blob", None, "application/octet-stream", 7),
    ]
    for r in rows:
        r.account_id = acc.id
    db.add_all(rows)
    db.commit()
    yield db, acc
    db.delete(acc)
    db.commit()
    db.close()


def test_category_mapping():
    assert svc.category_of("image/jpeg") == "Images"
    assert svc.category_of("application/pdf") == "Documents"
    assert svc.category_of("application/zip") == "Archives"
    assert svc.category_of("application/octet-stream") == "Other"


def test_overview_excludes_trash_and_shared(seeded):
    db, acc = seeded
    o = svc.overview(db, acc.id)
    by = {c["category"]: c for c in o["categories"]}
    assert by["Images"]["bytes"] == 150 and by["Videos"]["bytes"] == 1000
    assert by["Documents"]["bytes"] == 20 and by["Archives"]["bytes"] == 30 and by["Other"]["bytes"] == 7
    assert o["total_bytes"] == 1207 and o["trashed_bytes"] == 999 and o["trashed_files"] == 1
    assert o["categories"][0]["category"] == "Videos"  # sorted by size


def test_by_year(seeded):
    db, acc = seeded
    years = {y["year"]: y["bytes"] for y in svc.by_year(db, acc.id)}
    assert years == {2022: 50, 2024: 1157}


def test_largest_files_and_folders(seeded):
    db, acc = seeded
    assert [x.name for x in svc.largest_files(db, acc.id, 2)] == ["clip.mp4", "a.png"]
    folders = {x["name"]: x for x in svc.largest_folders(db, acc.id)}
    assert folders["Trips"]["bytes"] == 1100 and folders["Trips"]["files"] == 2
    assert folders["Photos"]["bytes"] == 1150  # includes subfolder, excludes trash and shared


def test_folder_cycle_does_not_hang(seeded):
    db, acc = seeded
    db.add_all([
        DriveFile(account_id=acc.id, google_file_id="X", name="X", mime_type=FOLDER, parent_folder_id="Y"),
        DriveFile(account_id=acc.id, google_file_id="Y", name="Y", mime_type=FOLDER, parent_folder_id="X"),
        DriveFile(account_id=acc.id, google_file_id="c1", name="c", mime_type="image/png", size=5, parent_folder_id="X"),
    ])
    db.commit()
    assert any(x["name"] in ("X", "Y") for x in svc.largest_folders(db, acc.id))


def test_api(seeded, monkeypatch):
    db, acc = seeded
    monkeypatch.setattr(oauth_service, "get_account", lambda _db: acc)
    c = TestClient(app)
    assert c.get("/api/analytics/overview").json()["total_bytes"] == 1207
    assert c.get("/api/analytics/largest-files?limit=1").json()["items"][0]["name"] == "clip.mp4"
    assert c.get("/api/analytics/largest-folders").status_code == 200
    assert c.get("/api/analytics/by-year").status_code == 200
    assert c.get("/api/analytics/largest-files?limit=0").status_code == 422
