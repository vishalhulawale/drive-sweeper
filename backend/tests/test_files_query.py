import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.database import SessionLocal
from app.main import app
from app.models import DriveAccount, DriveFile
from app.repositories import query_files as qf

FOLDER = qf.FOLDER


def f(gid, name, parent, mime="image/png", size=10, **kw):
    return DriveFile(google_file_id=gid, name=name, mime_type=mime, size=size, parent_folder_id=parent, **kw)


@pytest.fixture
def seeded():
    db = SessionLocal()
    acc = DriveAccount(google_user_id=f"test-{uuid.uuid4()}", email="t@example.com", access_token="x")
    db.add(acc)
    db.commit()
    rows = [
        f("A", "Alpha", "MYDRIVE_ROOT", FOLDER, None),           # parent never listed -> top level
        f("B", "Beta", "A", FOLDER, None),
        f("C", "Gamma", "B", FOLDER, None),
        f("x1", "report.png", "B", size=500),
        f("x2", "100%_done.txt", "A", mime="text/plain", size=5),
        f("x3", "old.png", "A", size=7, trashed=True),
        f("d1", "Notes", "A", "application/vnd.google-apps.document", None),
        f("s1", "shared.png", None, size=3, is_owned_by_user=False),   # no parent -> top level
    ]
    for r in rows:
        r.account_id = acc.id
    db.add_all(rows)
    db.commit()
    yield db, acc.id
    db.delete(acc)
    db.commit()
    db.close()


def names(rows):
    return [r.name for r in rows]


def test_top_level_includes_orphans_and_unknown_parent(seeded):
    db, acc = seeded
    rows, total = qf.list_files(db, acc, parent="root")
    assert names(rows) == ["Alpha", "shared.png"] and total == 2  # folders first


def test_children_excludes_trashed_by_default(seeded):
    db, acc = seeded
    rows, _ = qf.list_files(db, acc, parent="A")
    assert "old.png" not in names(rows)
    rows, _ = qf.list_files(db, acc, parent="A", trashed=True)
    assert "old.png" in names(rows)


def test_kind_filters(seeded):
    db, acc = seeded
    assert names(qf.list_files(db, acc, parent="A", kind="folder")[0]) == ["Beta"]
    assert names(qf.list_files(db, acc, parent="A", kind="doc")[0]) == ["Notes"]
    files = names(qf.list_files(db, acc, parent="A", kind="file")[0])
    assert "Notes" not in files and "100%_done.txt" in files


def test_search_is_literal_for_like_wildcards(seeded):
    db, acc = seeded
    assert names(qf.list_files(db, acc, q="100%")[0]) == ["100%_done.txt"]
    assert qf.list_files(db, acc, q="%")[1] == 1   # '%' matches only the literal percent sign
    assert qf.list_files(db, acc, q="REPORT")[1] == 1  # case-insensitive


def test_sort_and_pagination(seeded):
    db, acc = seeded
    rows, total = qf.list_files(db, acc, parent="B", kind="file", sort="size", order="desc")
    assert names(rows) == ["report.png"]
    rows, total = qf.list_files(db, acc, parent="A", page=2, page_size=1)
    assert total == 3 and len(rows) == 1


def test_tree_counts_and_breadcrumb(seeded):
    db, acc = seeded
    top = qf.folder_tree(db, acc, "root")
    assert [(r[1], r[2]) for r in top] == [("Alpha", 1)]
    assert [(r[1], r[2]) for r in qf.folder_tree(db, acc, "B")] == [("Gamma", 0)]
    assert [x.name for x in qf.breadcrumb(db, acc, "C")] == ["Alpha", "Beta", "Gamma"]


def test_summary(seeded):
    db, acc = seeded
    s = qf.summary(db, acc)
    assert s["total_items"] == 8 and s["folders"] == 3 and s["google_docs"] == 1
    assert s["trashed"] == 1 and s["shared_with_me"] == 1
    assert s["files"] == 4
    assert s["total_size"] == 500 + 5 + 3  # trashed file excluded from size


def test_api_endpoints_respond():
    c = TestClient(app)
    for url in ("/api/files/summary", "/api/files/tree", "/api/files?parent=root&page_size=5"):
        assert c.get(url).status_code in (200, 401), url
    assert c.get("/api/files?sort=bogus").status_code == 422
    assert c.get("/api/files?page_size=9999").status_code == 422
