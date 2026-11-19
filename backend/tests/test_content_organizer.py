"""Organizer suggestions by file content: excerpts, the Claude request, topic suggestions, new folders."""
import io
import threading
import uuid
import zipfile
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.api.cleanup import get_drive_client
from app.api.organizer import get_ai_client
from app.core.database import SessionLocal
from app.main import app
from app.models import DriveAccount, DriveFile
from app.services import content_classifier as cc
from app.services import oauth_service
from app.services import organizer_service as org
from app.services.google_drive import DriveError
from app.workers import topic_worker

FOLDER = "application/vnd.google-apps.folder"
GDOC = "application/vnd.google-apps.document"
WHEN = datetime(2024, 3, 5, tzinfo=timezone.utc)


def f(gid, name, parent=None, mime="application/pdf", **kw):
    kw.setdefault("is_owned_by_user", True)
    kw.setdefault("is_shortcut", False)
    kw.setdefault("trashed", False)
    kw.setdefault("md5_checksum", None if mime.startswith("application/vnd.google-apps") else f"md5-{gid}")
    return DriveFile(google_file_id=gid, name=name, mime_type=mime, size=100, parent_folder_id=parent,
                     parent_ids=[parent] if parent else None, modified_time=WHEN, created_time=WHEN, **kw)


def topic(row, folder, confidence="high", summary="A file"):
    row.content_topic, row.topic_confidence, row.topic_summary = folder, confidence, summary
    row.topic_key, row.topic_attempted_at = cc.topic_key(row), WHEN
    return row


# ---- excerpts ---------------------------------------------------------------------------------------


class ContentDrive:
    def __init__(self, contents=None, thumb=b"\xff\xd8jpeg"):
        self.contents = contents or {}
        self.thumb = thumb
        self.reads = []

    def read_content(self, gid, max_bytes, export_mime=None):
        self.reads.append((gid, export_mime))
        if gid not in self.contents:
            raise DriveError("HTTP 403")
        return self.contents[gid][:max_bytes]

    def get_thumbnail_link(self, gid):
        return "https://thumb/x=s220"

    def fetch_thumbnail(self, link, size):
        return self.thumb


def _docx(text):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("word/document.xml",
                   '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
                   f"<w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:body></w:document>")
    return buf.getvalue()


def _blank_pdf():
    from pypdf import PdfWriter

    w = PdfWriter()
    for _ in range(4):
        w.add_blank_page(100, 100)
    out = io.BytesIO()
    w.write(out)
    return out.getvalue()


def test_excerpts_by_type():
    drive = ContentDrive({"doc": b"Admission note from City Hospital", "w": _docx("Semester 3 mark sheet"),
                          "txt": b"hello   \n\n\n\nworld", "scan": _blank_pdf()})
    ex = cc.excerpt_of(drive, f("doc", "Note", mime=GDOC))
    assert ex.kind == "text" and "City Hospital" in ex.text and drive.reads[-1] == ("doc", "text/plain")
    assert cc.excerpt_of(drive, f("w", "a.docx", mime=cc.DOCX)).text == "Semester 3 mark sheet"
    assert cc.excerpt_of(drive, f("txt", "a.txt", mime="text/plain")).text == "hello\n\nworld"
    scan = cc.excerpt_of(drive, f("scan", "scan.pdf"))
    assert scan.kind == "pdf" and scan.media_type == "application/pdf"
    from pypdf import PdfReader
    assert len(PdfReader(io.BytesIO(scan.data)).pages) == cc.SCAN_PAGES   # only the first pages are sent
    img = cc.excerpt_of(drive, f("img", "IMG_1.jpg", mime="image/jpeg"))
    assert img.kind == "image" and img.media_type == "image/jpeg"


def test_unreadable_or_unsupported_files_go_by_name():
    drive = ContentDrive({"bad": b"not a pdf"})
    assert cc.excerpt_of(drive, f("missing", "x.pdf")).kind == "name"        # Drive refused
    assert cc.excerpt_of(drive, f("bad", "x.pdf")).kind == "name"            # broken PDF
    assert cc.excerpt_of(drive, f("v", "clip.mp4", mime="video/mp4")).kind == "name"
    big = f("big", "huge.pdf")
    big.size = cc.MAX_PDF_BYTES + 1
    assert cc.excerpt_of(drive, big).kind == "name" and ("big", None) not in drive.reads


def test_long_text_is_clipped():
    drive = ContentDrive({"t": b"x" * (cc.MAX_TEXT_CHARS * 3)})
    assert len(cc.excerpt_of(drive, f("t", "a.txt", mime="text/plain")).text) == cc.MAX_TEXT_CHARS


# ---- the Claude request -----------------------------------------------------------------------------


class FakeAI:
    """Stands in for anthropic.Anthropic: records requests and answers with the given topics by file name."""

    def __init__(self, answers, refuse=False):
        self.answers, self.refuse, self.calls = answers, refuse, []
        self.lock = threading.Lock()
        self.beta = SimpleNamespace(messages=SimpleNamespace(parse=self.parse))

    def parse(self, **kw):
        with self.lock:
            self.calls.append(kw)
        if self.refuse:
            return SimpleNamespace(stop_reason="refusal", parsed_output=None)
        text = "\n".join(b["text"] for b in kw["messages"][0]["content"] if b["type"] == "text")
        files = []
        for chunk in text.split('<file id="')[1:]:
            n = int(chunk.split('"', 1)[0])
            name = chunk.split("Name: ", 1)[1].split("\n", 1)[0]
            if name in self.answers:
                folder, conf = self.answers[name]
                files.append(cc.TopicChoice(id=n, folder=folder, confidence=conf, summary=f"About {name}"))
        return SimpleNamespace(stop_reason="end_turn", parsed_output=cc.TopicResult(files=files))


def test_request_shape():
    ai = FakeAI({"bill.pdf": ("Medical", "high")})
    rows = [(f("a", "bill.pdf"), cc.Excerpt("text", text="Invoice from City Hospital")),
            (f("b", "IMG_1.jpg", mime="image/jpeg"), cc.Excerpt("image", data=b"\xff\xd8", media_type="image/jpeg"))]
    out = cc.classify_batch(ai, cc.system_prompt(["Hospital", "School"]), rows, {})
    assert out[1].folder == "Medical" and 2 not in out
    call = ai.calls[0]
    assert call["model"] == "claude-opus-5-5" and call["output_format"] is cc.TopicResult
    assert call["fallbacks"] == "default" and call["output_config"] == {"effort": "low"}
    assert "- Hospital" in call["system"] and "Medical" in call["system"]
    types = [b["type"] for b in call["messages"][0]["content"]]
    assert types.count("image") == 1 and "<content>" in call["messages"][0]["content"][0]["text"]


def test_refusal_leaves_files_unclassified():
    ai = FakeAI({}, refuse=True)
    assert cc.classify_batch(ai, "sys", [(f("a", "x.pdf"), cc.Excerpt("name"))], {}) == {}


# ---- suggestions ------------------------------------------------------------------------------------


def test_content_suggestions_reuse_existing_folder_or_propose_a_new_one():
    rows = [
        f("HOSP", "hospital", None, FOLDER),
        f("NESTED", "Hospital", "HOSP", FOLDER),                       # a nested folder of the same name loses
        topic(f("a", "bill.pdf"), "Hospital"),
        topic(f("b", "marks.pdf"), "Education", "medium"),
        topic(f("c", "blurry.jpg", mime="image/jpeg"), "Photos", "low"),  # low confidence: not suggested
        f("d", "never-read.pdf"),                                      # not analyzed yet
        topic(f("e", "inside.pdf", "HOSP"), "Hospital"),               # not loose
    ]
    stale = topic(f("g", "edited.pdf"), "Medical")
    stale.md5_checksum = "changed-since"                               # topic is out of date
    out = org.propose_by_content(rows + [stale])
    assert [(o["file"].google_file_id, o["folder_id"], o["folder_name"], o["new_folder"]) for o in out] == [
        ("a", "HOSP", "hospital", False), ("b", None, "Education", True)]
    assert out[0]["confidence"] == "high" and out[0]["summary"] == "A file"
    assert any("new folder" in r for r in out[1]["reasons"])
    # From inside the folder, a file already there is not suggested.
    assert org.propose_by_content(rows, source="HOSP") == []


def test_google_docs_are_candidates_and_keyed_by_modified_time():
    doc = f("doc", "Notes", mime=GDOC)
    assert cc.is_candidate(doc) and cc.topic_key(doc) == WHEN.isoformat()
    assert not cc.is_candidate(f("form", "Survey", mime="application/vnd.google-apps.form"))
    assert not cc.is_candidate(f("x", "x.pdf", is_owned_by_user=False))


# ---- running and applying ---------------------------------------------------------------------------


class MoveDrive(ContentDrive):
    def __init__(self, contents=None):
        super().__init__(contents)
        self.live, self.moves, self.created = {}, [], []
        self.fail_create = False

    def add(self, gid, parents):
        self.live[gid] = {"id": gid, "parents": list(parents), "ownedByMe": True, "trashed": False,
                          "capabilities": {"canMoveItemWithinDrive": True}}

    def get_file(self, gid):
        return dict(self.live[gid])

    def move_file(self, gid, add_parent, remove_parents, extra_add=None):
        self.moves.append((gid, add_parent))
        self.live[gid]["parents"] = [add_parent]

    def find_folder(self, name, parent_id):
        return next((g for g, n in self.created if n == name), None)

    def create_folder(self, name, parent_id):
        if self.fail_create:
            raise DriveError("quota")
        gid = f"NEW-{len(self.created)}"
        self.created.append((gid, name))
        self.add(gid, [parent_id])
        return gid


@pytest.fixture
def env():
    db = SessionLocal()
    acc = DriveAccount(google_user_id=f"test-{uuid.uuid4()}", email="t@example.com", access_token="x",
                       granted_scopes=oauth_service.TRASH_SCOPE)
    db.add(acc)
    db.commit()
    rows = [f("SCHOOL", "School", None, FOLDER), f("bill", "bill.pdf"), f("marks", "marks.pdf"),
            f("fees", "fee receipt.pdf"), f("doc", "Discharge summary", mime=GDOC)]
    for r in rows:
        r.account_id = acc.id
    db.add_all(rows)
    db.commit()
    drive = MoveDrive({"bill": b"x", "marks": b"x", "fees": b"x", "doc": b"Discharge summary, City Hospital"})
    for gid in ("SCHOOL", "bill", "marks", "fees", "doc"):
        drive.add(gid, [])
    yield db, acc, drive
    db.delete(acc)
    db.commit()
    db.close()


ANSWERS = {"bill.pdf": ("Medical", "high"), "Discharge summary": ("Medical", "high"),
           "marks.pdf": ("School", "high"), "fee receipt.pdf": ("school", "medium")}


def test_run_classifies_then_resumes_without_rereading(env):
    db, acc, drive = env
    ai = FakeAI(ANSWERS)
    result = cc.run(SessionLocal, drive, ai, acc.id, "root")
    assert result == {"classified": 4, "unclassified": 0, "total": 4, "cancelled": False}
    db.expire_all()
    row = db.scalar(select(DriveFile).where(DriveFile.account_id == acc.id, DriveFile.google_file_id == "doc"))
    assert row.content_topic == "Medical" and row.topic_summary == "About Discharge summary"
    assert cc.status(db, acc.id, "root") == {"candidates": 4, "analyzed": 4, "pending": 0}
    calls = len(ai.calls)
    assert cc.run(SessionLocal, drive, ai, acc.id, "root")["total"] == 0 and len(ai.calls) == calls


def test_cancelled_run_stops_before_asking(env):
    db, acc, drive = env
    ai = FakeAI(ANSWERS)
    stop = threading.Event()
    stop.set()
    assert cc.run(SessionLocal, drive, ai, acc.id, "root", stop)["cancelled"] and ai.calls == []


def test_apply_creates_each_new_folder_once_and_reuses_existing(env):
    db, acc, drive = env
    cc.run(SessionLocal, drive, FakeAI(ANSWERS), acc.id, "root")
    db.expire_all()
    out = org.propose_by_content(org.live_files(db, acc.id))
    by_file = {o["file"].google_file_id: o for o in out}
    assert by_file["marks"]["folder_id"] == "SCHOOL" and by_file["fees"]["folder_id"] == "SCHOOL"  # case-insensitive
    assert by_file["bill"]["new_folder"] and by_file["doc"]["new_folder"]
    moves = [{"file_id": o["file"].google_file_id, "folder_id": o["folder_id"],
              "folder_name": o["folder_name"] if o["new_folder"] else None} for o in out]
    ops = org.apply_moves(db, acc.id, drive, moves)
    assert [o.status for o in ops] == ["completed"] * 4
    assert drive.created == [("NEW-0", "Medical")]                       # one folder for both medical files
    assert sorted(drive.moves) == [("bill", "NEW-0"), ("doc", "NEW-0"), ("fees", "SCHOOL"), ("marks", "SCHOOL")]
    db.expire_all()
    # The new folder is known locally, so nothing is suggested any more and a later Medical file reuses it.
    assert org.propose_by_content(org.live_files(db, acc.id)) == []
    assert "medical" in org.folders_by_name(org.live_files(db, acc.id))


def test_folder_creation_failure_fails_only_those_moves(env):
    db, acc, drive = env
    drive.fail_create = True
    ops = org.apply_moves(db, acc.id, drive, [{"file_id": "bill", "folder_name": "Medical"},
                                              {"file_id": "marks", "folder_id": "SCHOOL"}])
    assert [o.status for o in ops] == ["failed", "completed"]
    assert "Could not create the folder" in ops[0].error_message
    with pytest.raises(ValueError):
        org.apply_moves(db, acc.id, drive, [{"file_id": "bill", "folder_name": "a/b"}])


def test_content_api(env, monkeypatch):
    db, acc, drive = env
    monkeypatch.setattr(oauth_service, "get_account", lambda _db: acc)
    ai = FakeAI(ANSWERS)
    app.dependency_overrides[get_drive_client] = lambda: drive
    app.dependency_overrides[get_ai_client] = lambda: ai
    try:
        c = TestClient(app)
        assert c.get("/api/organizer/content/status").json()["pending"] == 4
        assert c.post("/api/organizer/content/start").status_code == 202
        for _ in range(200):
            if not topic_worker.state()["running"]:
                break
            threading.Event().wait(0.02)
        s = c.get("/api/organizer/content/status").json()
        assert s["pending"] == 0 and s["last_error"] is None and s["progress_done"] == 4
        page = c.get("/api/organizer/suggestions?method=content").json()
        assert page["method"] == "content" and len(page["items"]) == 4
        new = next(i for i in page["items"] if i["new_folder"])
        assert new["folder_id"] is None and new["folder_name"] == "Medical"
        r = c.post("/api/organizer/apply", json={"moves": [{"file_id": new["file"]["google_file_id"], "folder_name": "Medical"}]})
        assert r.status_code == 200 and r.json()[0]["status"] == "completed"
        assert c.post("/api/organizer/apply", json={"moves": [{"file_id": "bill"}]}).status_code == 422
    finally:
        app.dependency_overrides.clear()
