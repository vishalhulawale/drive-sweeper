import hashlib
import io
import tarfile
import threading
import time
import uuid
import zipfile

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.database import SessionLocal
from app.main import app
from app.models import ArchiveExtraction, CleanupOperation, DriveAccount, DriveFile
from app.services import archive_service as svc
from app.services import oauth_service
from app.services.archive_reader import Archive, folder_name_for, kind_of, safe_parts
from app.services.google_drive import FOLDER_MIME, DriveError, NotFound

md5 = lambda b: hashlib.md5(b).hexdigest()  # noqa: E731


class FakeDrive:
    """In-memory Drive: files with parents, contents, and calls recorded. Thread-safe."""

    def __init__(self, quota_free=None, upload_delay=0.0):
        self.files: dict[str, dict] = {}
        self.content: dict[str, bytes] = {}
        self.lock = threading.Lock()
        self.fail_upload: set[str] = set()   # file names whose upload fails
        self.quota_free, self.upload_delay = quota_free, upload_delay
        self.trashed: list[str] = []
        self.downloads = 0
        self.active = self.peak_downloads = 0
        self._n = 0

    def _id(self):
        self._n += 1
        return f"id{self._n}"

    def add(self, fid, name, parents, data=b"", mime="application/zip", owned=True):
        self.files[fid] = {"id": fid, "name": name, "mimeType": mime, "parents": parents, "trashed": False,
                           "ownedByMe": owned, "md5Checksum": md5(data), "size": str(len(data)),
                           "capabilities": {"canTrash": True}}
        self.content[fid] = data

    def get_file(self, fid):
        with self.lock:
            if fid not in self.files:
                raise NotFound("404")
            return dict(self.files[fid])

    def download_to(self, fid, path, stop=None):
        with self.lock:
            self.downloads += 1
            self.active += 1
            self.peak_downloads = max(self.peak_downloads, self.active)
        time.sleep(self.upload_delay)
        with open(path, "wb") as fh:
            fh.write(self.content[fid])
        with self.lock:
            self.active -= 1

    def create_folder(self, name, parent):
        with self.lock:
            fid = self._id()
            self.files[fid] = {"id": fid, "name": name, "mimeType": FOLDER_MIME, "parents": [parent], "trashed": False,
                               "ownedByMe": True}
            return fid

    def _children(self, parent):
        return [f for f in self.files.values() if parent in f["parents"] and not f["trashed"]]

    def find_folder(self, name, parent):
        with self.lock:
            hit = [f for f in self._children(parent) if f["name"] == name and f["mimeType"] == FOLDER_MIME]
            return hit[0]["id"] if hit else None

    def list_children(self, folder_id):
        with self.lock:
            return [dict(f) for f in self._children(folder_id)]

    def upload_file(self, path, name, parent, mime, stop=None):
        if stop is not None and stop.is_set():
            from app.services.google_drive import Interrupted
            raise Interrupted()
        time.sleep(self.upload_delay)
        if name in self.fail_upload:
            raise DriveError("Drive API error 500: backendError")
        data = open(path, "rb").read()
        with self.lock:
            fid = self._id()
            self.add(fid, name, [parent], data, mime)
            return {"id": fid, "md5Checksum": md5(data), "size": str(len(data))}

    def storage_quota(self):
        return (None, 0) if self.quota_free is None else (self.quota_free, 0)

    def set_trashed(self, fid, trashed):
        with self.lock:
            self.files[fid]["trashed"] = trashed
            self.trashed.append(fid)
        return {"id": fid, "trashed": trashed}

    # helpers for assertions
    def tree(self, folder_id, prefix=""):
        out = {}
        for f in sorted(self._children(folder_id), key=lambda f: f["name"]):
            if f["mimeType"] == FOLDER_MIME:
                out.update(self.tree(f["id"], f"{prefix}{f['name']}/"))
            else:
                out[prefix + f["name"]] = self.content[f["id"]]
        return out


def make_zip(entries: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, data in entries.items():
            z.writestr(name, data)
    return buf.getvalue()


def make_tgz(entries: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as t:
        for name, data in entries.items():
            info = tarfile.TarInfo(name)
            info.size = len(data)
            t.addfile(info, io.BytesIO(data))
    return buf.getvalue()


@pytest.fixture
def env(monkeypatch, tmp_path):
    monkeypatch.setattr(svc.settings, "extract_dir", str(tmp_path))
    monkeypatch.setattr(svc, "DISK_MARGIN", 0)
    db = SessionLocal()
    acc = DriveAccount(google_user_id=f"test-{uuid.uuid4()}", email="t@example.com", access_token="x",
                       granted_scopes=oauth_service.TRASH_SCOPE)
    db.add(acc)
    db.commit()
    drive = FakeDrive()
    drive.files["P"] = {"id": "P", "name": "Projects", "mimeType": FOLDER_MIME, "parents": ["root"], "trashed": False}

    def archive(gid, name, data, parent="P"):
        drive.add(gid, name, [parent], data)
        f = DriveFile(google_file_id=gid, account_id=acc.id, name=name, mime_type="application/zip",
                      size=len(data), md5_checksum=md5(data), parent_folder_id=parent, parent_ids=[parent])
        db.add(f)
        db.commit()
        return f

    yield db, acc, drive, archive
    db.delete(acc)
    db.commit()
    db.close()


def run(db, acc, drive, files, cancelled=None):
    ids = svc.prepare(db, acc.id, [f.id for f in files])
    svc.process(SessionLocal, acc.id, drive, ids, cancelled or threading.Event())
    db.expire_all()
    return [db.get(ArchiveExtraction, i) for i in ids]


def test_names_and_safe_paths():
    assert folder_name_for("Photos 2019.zip") == "Photos 2019"
    assert folder_name_for("backup.TAR.GZ") == "backup"
    assert folder_name_for(".zip") == ".zip"
    assert kind_of("a.tgz") == "tar" and kind_of("a.RAR") == "rar" and kind_of("a.7z") is None
    assert safe_parts("a/b\\c.txt") == ("a", "b", "c.txt")
    assert safe_parts("./a//b.txt") == ("a", "b.txt")
    for bad in ("../evil.txt", "a/../../evil", "/etc/passwd", "C:/x.txt", "__MACOSX/._a.jpg", "a/.DS_Store"):
        assert safe_parts(bad) is None, bad


def test_extracts_into_folder_named_after_archive_and_trashes_it(env):
    db, acc, drive, archive = env
    data = make_zip({"readme.txt": b"hello", "photos/2019/a.jpg": b"\xff\xd8jpeg", "photos/b.png": b"png", "empty.txt": b""})
    f = archive("Z", "Holiday 2019.zip", data)
    [ex] = run(db, acc, drive, [f])

    assert ex.status == "completed", ex.error_message
    folder = drive.files[ex.folder_google_id]
    assert folder["name"] == "Holiday 2019" and folder["parents"] == ["P"]   # same location as the archive
    assert drive.tree(ex.folder_google_id) == {
        "empty.txt": b"", "photos/2019/a.jpg": b"\xff\xd8jpeg", "photos/b.png": b"png", "readme.txt": b"hello"}
    assert (ex.files_total, ex.files_done, ex.files_skipped) == (4, 4, 0)
    assert drive.files["Z"]["trashed"] and ex.archive_trashed
    assert db.scalar(select(DriveFile.trashed).where(DriveFile.id == f.id)) is True
    op = db.scalar(select(CleanupOperation).where(CleanupOperation.google_file_id == "Z"))
    assert (op.operation_type, op.status, op.previous_parent_ids) == ("trash", "completed", ["P"])  # restorable


def test_tar_gz_and_unsafe_entries_are_ignored(env, tmp_path):
    db, acc, drive, archive = env
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as t:
        for name, payload in {"ok/a.txt": b"a", "../escape.txt": b"x", "/abs.txt": b"y"}.items():
            info = tarfile.TarInfo(name)
            info.size = len(payload)
            t.addfile(info, io.BytesIO(payload))
        link = tarfile.TarInfo("ok/link")
        link.type, link.linkname = tarfile.SYMTYPE, "/etc/passwd"
        t.addfile(link)
    f = archive("T", "logs.tar.gz", buf.getvalue())
    [ex] = run(db, acc, drive, [f])
    assert ex.status == "completed", ex.error_message
    assert drive.tree(ex.folder_google_id) == {"ok/a.txt": b"a"}
    assert ex.entries_ignored == 3
    assert not any(v["name"] in ("escape.txt", "abs.txt", "passwd") for v in drive.files.values())


def test_refuses_existing_folder_it_did_not_create(env):
    db, acc, drive, archive = env
    f = archive("Z", "Report.zip", make_zip({"a.txt": b"a"}))
    drive.create_folder("Report", "P")  # the user's own folder with that name
    [ex] = run(db, acc, drive, [f])
    assert ex.status == "failed" and "already exists" in ex.error_message
    assert not drive.files["Z"]["trashed"]
    assert sum(1 for v in drive.files.values() if v["mimeType"] != FOLDER_MIME) == 1  # nothing uploaded


def test_failed_upload_keeps_archive_and_retry_resumes(env):
    db, acc, drive, archive = env
    f = archive("Z", "set.zip", make_zip({"a.txt": b"a", "b.txt": b"b", "c.txt": b"c"}))
    drive.fail_upload = {"b.txt"}
    [first] = run(db, acc, drive, [f])
    assert first.status == "failed" and "1 of 3 files" in first.error_message
    assert not drive.files["Z"]["trashed"]
    assert drive.tree(first.folder_google_id) == {"a.txt": b"a", "c.txt": b"c"}

    drive.fail_upload = set()
    [second] = run(db, acc, drive, [f])
    assert second.status == "completed", second.error_message
    assert second.folder_google_id == first.folder_google_id          # same folder, not "set (1)"
    assert second.files_skipped == 2                                   # a.txt and c.txt were already there
    assert drive.tree(second.folder_google_id) == {"a.txt": b"a", "b.txt": b"b", "c.txt": b"c"}
    assert drive.files["Z"]["trashed"]


def test_changed_archive_is_not_touched(env):
    db, acc, drive, archive = env
    f = archive("Z", "x.zip", make_zip({"a.txt": b"a"}))
    drive.files["Z"]["md5Checksum"] = "0" * 32  # edited in Drive since the scan
    [ex] = run(db, acc, drive, [f])
    assert ex.status == "failed" and "changed since the scan" in ex.error_message
    assert drive.downloads == 0 and ex.folder_google_id is None


def test_not_enough_drive_space_stops_before_creating_anything(env):
    db, acc, drive, archive = env
    f = archive("Z", "big.zip", make_zip({"a.bin": b"0" * 5000}))
    drive.quota_free = 100
    [ex] = run(db, acc, drive, [f])
    assert ex.status == "failed" and "free space in your Google Drive" in ex.error_message
    assert ex.folder_google_id is None and not drive.files["Z"]["trashed"]


def test_corrupt_archive_fails_cleanly(env):
    db, acc, drive, archive = env
    f = archive("Z", "broken.zip", b"this is not a zip")
    [ex] = run(db, acc, drive, [f])
    assert ex.status == "failed" and "Cannot read the archive" in ex.error_message
    assert not drive.files["Z"]["trashed"]


def test_password_protected_zip_is_refused(tmp_path):
    data = bytearray(make_zip({"secret.txt": b"s"}))
    # Set the "encrypted" flag in the local and central headers, as an encrypting zip tool would.
    for sig, off in ((b"PK\x03\x04", 6), (b"PK\x01\x02", 8)):
        i = data.find(sig)
        data[i + off] |= 0x1
    p = tmp_path / "p.zip"
    p.write_bytes(bytes(data))
    with pytest.raises(svc.ArchiveError, match="password"):
        with Archive(str(p), "zip"):
            pass


def test_archives_run_in_parallel(env):
    db, acc, drive, archive = env
    drive.upload_delay = 0.05
    files = [archive(f"Z{i}", f"a{i}.zip", make_zip({"x.txt": bytes([i])})) for i in range(3)]
    exs = run(db, acc, drive, files)
    assert [e.status for e in exs] == ["completed"] * 3
    assert drive.peak_downloads > 1


def test_files_upload_in_parallel_within_one_archive(env):
    db, acc, drive, archive = env
    f = archive("Z", "many.zip", make_zip({f"f{i:02}.txt": bytes([i]) for i in range(40)}))
    lock, state = threading.Lock(), {"active": 0, "peak": 0}
    real_upload = drive.upload_file

    def counted(*a, **kw):
        with lock:
            state["active"] += 1
            state["peak"] = max(state["peak"], state["active"])
        try:
            time.sleep(0.02)
            return real_upload(*a, **kw)
        finally:
            with lock:
                state["active"] -= 1

    drive.upload_file = counted
    [ex] = run(db, acc, drive, [f])
    assert ex.status == "completed", ex.error_message
    assert state["peak"] > 4 and state["peak"] <= svc.UPLOAD_WORKERS


def test_upload_buffer_is_capped_by_bytes(monkeypatch):
    monkeypatch.setattr(svc, "BUFFER_BYTES", 100)
    assert svc._buffer_bytes([10] * 50) == 100   # the QUEUE_DEPTH biggest would be 240
    assert svc._buffer_bytes([60, 60, 60]) == 100
    assert svc._buffer_bytes([500, 1]) == 500   # one file bigger than the cap still fits
    assert svc._buffer_bytes([]) == 0


def test_cancel_skips_queued_archives(env):
    db, acc, drive, archive = env
    files = [archive(f"Z{i}", f"a{i}.zip", make_zip({"x.txt": b"x"})) for i in range(2)]
    ids = svc.prepare(db, acc.id, [f.id for f in files])
    assert svc.cancel_pending(db, acc.id) == 2
    svc.process(SessionLocal, acc.id, drive, ids, threading.Event())
    db.expire_all()
    assert [db.get(ArchiveExtraction, i).status for i in ids] == ["cancelled", "cancelled"]
    assert drive.downloads == 0


def test_stop_mid_run_keeps_archive_and_next_attempt_resumes(env):
    """A cancel or a server shutdown sets the event: the archive is recorded as stopped, never trashed,
    and extracting it again finishes the job without uploading anything twice."""
    db, acc, drive, archive = env
    f = archive("Z", "many.zip", make_zip({f"f{i:02}.txt": bytes([i]) for i in range(30)}))
    stop = threading.Event()
    real_upload = drive.upload_file

    def upload_then_stop(*a, **kw):
        result = real_upload(*a, **kw)
        stop.set()  # the user presses Cancel (or the server shuts down) after the first upload
        return result

    drive.upload_file = upload_then_stop
    [first] = run(db, acc, drive, [f], cancelled=stop)
    assert first.status == "cancelled" and "Extract it again" in first.error_message
    assert 0 < first.files_done < 30 and not drive.files["Z"]["trashed"]

    drive.upload_file = real_upload
    [second] = run(db, acc, drive, [f])
    assert second.status == "completed", second.error_message
    assert second.folder_google_id == first.folder_google_id
    assert second.files_skipped == first.files_done
    assert len(drive.tree(second.folder_google_id)) == 30          # every file exactly once
    assert drive.files["Z"]["trashed"]


def test_only_one_run_at_a_time_and_only_your_archives(env):
    db, acc, drive, archive = env
    f = archive("Z", "x.zip", make_zip({"a.txt": b"a"}))
    other = DriveFile(google_file_id="S", account_id=acc.id, name="shared.zip", mime_type="application/zip",
                      size=1, is_owned_by_user=False)
    db.add(other)
    db.commit()
    with pytest.raises(ValueError, match="not archives you own"):
        svc.prepare(db, acc.id, [other.id])
    svc.prepare(db, acc.id, [f.id])
    with pytest.raises(svc.RunInProgress):
        svc.prepare(db, acc.id, [f.id])


def test_api_lists_archives_and_needs_trash_permission(env, monkeypatch):
    db, acc, drive, archive = env
    db.add(DriveFile(google_file_id="P", account_id=acc.id, name="Projects", mime_type=FOLDER_MIME))
    db.commit()
    archive("Z", "Docs.zip", make_zip({"a.txt": b"a"}))
    archive("R", "Top.zip", make_zip({"a.txt": b"a"}), parent="root")  # the root folder is never in the inventory
    monkeypatch.setattr(oauth_service, "get_account", lambda _db: db.get(DriveAccount, acc.id))
    c = TestClient(app)
    body = c.get("/api/archives").json()
    by_id = {i["file"]["google_file_id"]: i for i in body["items"]}
    item = by_id["Z"]
    assert (item["kind"], item["folder_name"], item["parent_name"], item["last"]) == ("zip", "Docs", "Projects", None)
    assert by_id["R"]["parent_name"] == "My Drive"
    assert "P" not in by_id  # folders are never listed, even with an archive-like name

    db.add(DriveFile(google_file_id="S", account_id=acc.id, name="theirs.zip", mime_type="application/zip",
                     size=5, is_owned_by_user=False, parent_folder_id="X"))
    db.commit()
    assert "S" not in {i["file"]["google_file_id"] for i in c.get("/api/archives").json()["items"]}  # owned by me (default)
    shared = {i["file"]["google_file_id"]: i for i in c.get("/api/archives?owned=false").json()["items"]}
    assert shared["S"]["parent_name"] == "Shared with me" and not shared["S"]["file"]["is_owned_by_user"]
    assert {"Z", "R"} <= shared.keys()

    acc_row = db.get(DriveAccount, acc.id)
    acc_row.granted_scopes = oauth_service.DRIVE_SCOPE
    db.commit()
    assert c.post("/api/archives/extract", json={"file_ids": [item["file_id"]]}).status_code == 403


def test_drive_connections_do_not_treat_resumable_308_as_a_redirect():
    from app.services.google_drive import _http
    assert 308 not in _http(5).redirect_codes  # else every resumable upload fails with RedirectMissingLocation


@pytest.mark.parametrize("size", [10, 6 * 1024 * 1024])  # simple and resumable upload
def test_upload_closes_its_file_so_the_temp_file_can_be_removed(tmp_path, size):
    from app.services.google_drive import DriveClient

    seen = {}

    class Request:
        def __init__(self, media):
            self.media = media

        def execute(self):
            return {"id": "new", "md5Checksum": "m"}

        def next_chunk(self):
            return None, {"id": "new", "md5Checksum": "m"}

    class Files:
        def create(self, body, media_body, fields):
            seen["media"] = media_body
            return Request(media_body)

    class Service:
        def files(self):
            return Files()

    p = tmp_path / "f.bin"
    p.write_bytes(b"x" * size)
    out = DriveClient(credentials=None, service=Service()).upload_file(str(p), "f.bin", "P", "application/octet-stream")
    assert out["id"] == "new"
    assert seen["media"].resumable() is (size > 5 * 1024 * 1024)
    p.unlink()  # would raise PermissionError on Windows if the upload kept the file open


def test_a_temp_file_that_cannot_be_removed_does_not_fail_the_archive(env, monkeypatch):
    db, acc, drive, archive = env
    f = archive("Z", "locked.zip", make_zip({"a.txt": b"a", "b.txt": b"b"}))
    real_remove = svc.os.remove

    def locked(path):
        if path.endswith("f0"):
            raise PermissionError(32, "The process cannot access the file because it is being used by another process")
        real_remove(path)

    monkeypatch.setattr(svc.os, "remove", locked)
    [ex] = run(db, acc, drive, [f])
    assert ex.status == "completed", ex.error_message
    assert drive.files["Z"]["trashed"]
