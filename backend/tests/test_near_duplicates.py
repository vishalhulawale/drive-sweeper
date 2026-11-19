import io
import random
import threading
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw
from sqlalchemy import select

from app.api import near_duplicates as near_api
from app.core.database import SessionLocal
from app.main import app
from app.models import DriveAccount, DriveFile, DuplicateGroup, DuplicateGroupFile
from app.services import cleanup_service as cs
from app.services import near_duplicate_service as nds
from app.services import oauth_service, perceptual
from app.services.google_drive import DriveError


def picture(seed: int, size=(240, 180)) -> Image.Image:
    """A deterministic busy picture; different seeds look different."""
    rnd = random.Random(seed)
    img = Image.new("RGB", size, (rnd.randrange(256), rnd.randrange(256), rnd.randrange(256)))
    d = ImageDraw.Draw(img)
    for _ in range(25):
        x, y = rnd.randrange(size[0]), rnd.randrange(size[1])
        d.ellipse([x, y, x + rnd.randrange(10, 90), y + rnd.randrange(10, 70)],
                  fill=(rnd.randrange(256), rnd.randrange(256), rnd.randrange(256)))
    return img


def encode(img: Image.Image, fmt="JPEG", quality=90) -> bytes:
    buf = io.BytesIO()
    img.save(buf, fmt, quality=quality)
    return buf.getvalue()


def fp(img, fmt="JPEG", quality=90):
    return perceptual.fingerprint(encode(img, fmt, quality))


def same(a, b):
    return (perceptual.distance(a.hash, b.hash) <= perceptual.DEFAULT_MAX_DISTANCE
            and perceptual.same_picture(perceptual.Detail(a.detail), perceptual.Detail(b.detail)))


def form_page(seed: int) -> Image.Image:
    """A printed form: identical grid and headings on every page, different 'handwriting' per page."""
    rnd = random.Random(seed)
    img = Image.new("RGB", (240, 340), "white")
    d = ImageDraw.Draw(img)
    for y in range(20, 330, 30):
        d.line([(10, y), (230, y)], fill=(90, 90, 90))
    for x in (10, 80, 160, 230):
        d.line([(x, 20), (x, 320)], fill=(90, 90, 90))
    d.rectangle([10, 4, 230, 16], fill=(40, 40, 40))
    for y in range(24, 320, 30):  # the entries differ from page to page
        for x0 in (14, 84, 164):
            for _ in range(rnd.randrange(2, 6)):
                x = x0 + rnd.randrange(0, 50)
                d.rectangle([x, y + 6, x + rnd.randrange(3, 14), y + 14], fill=(20, 20, 20))
    return img


def test_fingerprint_matches_resized_and_recompressed_copies():
    base = picture(1)
    f = fp(base)
    assert len(f.detail) == perceptual.DETAIL_BYTES and f.hash.bit_length() <= perceptual.HASH_BITS
    assert same(f, fp(base.resize((480, 360)), quality=40))
    assert same(f, fp(base, "PNG"))
    assert same(f, fp(base.resize((120, 90))))
    assert not same(f, fp(picture(2)))


def test_fingerprint_rejects_a_colour_only_difference():
    """Swatches and recoloured icons: identical shapes, different colours."""
    base = picture(3)
    r, g, b = base.split()
    recoloured = Image.merge("RGB", (b, r, g))  # same structure, different hues
    assert not same(fp(base), fp(recoloured))
    assert not same(fp(base), fp(base.convert("L").convert("RGB")))  # black-and-white edit


def test_fingerprint_rejects_other_pages_of_the_same_form_but_matches_a_resaved_page():
    page = form_page(1)
    assert same(fp(page), fp(page, "PNG"))
    assert same(fp(page), fp(page.resize((180, 255)), quality=60))
    for other in range(2, 6):
        assert not same(fp(page), fp(form_page(other))), other


def test_flat_images_never_match():
    blank = Image.new("RGB", (200, 200), (250, 250, 250))
    assert not same(fp(blank), fp(blank))


def test_bad_bytes_raise_badimage():
    with pytest.raises(perceptual.BadImage):
        perceptual.fingerprint(b"not an image")


def test_cluster_groups_close_hashes_and_ignores_flat_images():
    a = 0xF0F0_F0F0_0F0F_0F0F
    near = a ^ 0b101                       # 2 bits away
    far = a ^ 0xFFFF_FFFF                 # 32 bits away
    flat = 0                              # blank image: no information, must not match anything
    groups = perceptual.cluster([(1, a), (2, near), (3, far), (4, flat), (5, flat)], 4, bits=64)
    assert groups == [[1, 2]]
    assert perceptual.cluster([(1, a), (2, a ^ 0b11111)], max_distance=4, bits=64) == []        # 5 bits: too far
    assert perceptual.cluster([(1, a), (2, a ^ 0b11111)], max_distance=5, bits=64) == [[1, 2]]


def test_cluster_finds_pairs_differing_in_every_chunk_position():
    a = 0xAAAA_5555_AAAA_5555
    for bit in range(64):
        assert perceptual.cluster([(1, a), (2, a ^ (1 << bit))], 4, bits=64) == [[1, 2]], bit      # pigeonhole holds


def test_cluster_does_not_chain_far_apart_photos_into_one_group():
    a = 0xAAAA_5555_AAAA_5555
    b = a ^ 0b111                  # 3 bits from a
    c = b ^ (0b111 << 20)          # 3 bits from b, 6 bits from a
    d = c ^ (0b111 << 40)          # 3 bits from c, 9 bits from a
    # Old behaviour: one group [1, 2, 3, 4] through the chain. Now each group centres on its first member.
    assert perceptual.cluster([(1, a), (2, b), (3, c), (4, d)], 4, bits=64) == [[1, 2], [3, 4]]
    # The preferred (first) item is the centre: with c first, b and d both sit within 3 bits of it.
    assert perceptual.cluster([(3, c), (1, a), (2, b), (4, d)], 4, bits=64) == [[2, 3, 4]]


def test_every_group_member_is_close_to_the_groups_first_member():
    rnd = random.Random(7)
    seeds = [rnd.getrandbits(64) | 0xF0 for _ in range(20)]
    items, n = [], 0
    for s in seeds:                # random walks: lots of chains, as in a burst of photos
        h = s
        for _ in range(8):
            items.append((n, h))
            n += 1
            h ^= 1 << rnd.randrange(64)
    rnd.shuffle(items)
    by_key = dict(items)
    order = [k for k, _ in items]
    groups = perceptual.cluster(items, 4, bits=64)
    assert groups
    seen = set()
    for g in groups:
        centre = min(g, key=order.index)  # the earliest item in the input is the centre
        assert all(perceptual.distance(by_key[centre], by_key[k]) <= 4 for k in g)
        assert not seen & set(g)          # a photo is in at most one group
        seen |= set(g)


# ---- service ------------------------------------------------------------------------------------


class FakeDrive:
    """images: {google_id: bytes or None}; mimics list/thumbnail endpoints."""

    def __init__(self, images, no_link=(), flaky=()):
        self.images, self.no_link, self.flaky = images, set(no_link), set(flaky)
        self.fetched = []

    def list_image_thumbnails_page(self, token=None):
        ids = list(self.images)
        start = int(token) if token else 0
        page = ids[start:start + 2]                                     # tiny pages exercise paging
        nxt = str(start + 2) if start + 2 < len(ids) else None
        return [{"id": i, "thumbnailLink": None if i in self.no_link else f"link-{i}"} for i in page], nxt

    def fetch_thumbnail(self, link, size=64):
        gid = link[5:]
        self.fetched.append(gid)
        if gid in self.flaky:
            raise DriveError("temporary")
        return self.images[gid]

    def get_thumbnail_link(self, gid):
        return f"link-{gid}"


def mkfile(gid, md5, size=100_000, day=1, **kw):
    return DriveFile(google_file_id=gid, name=f"{gid}.jpg", mime_type="image/jpeg", size=size, md5_checksum=md5,
                     created_time=datetime(2024, 1, day, tzinfo=timezone.utc), **kw)


@pytest.fixture
def env():
    db = SessionLocal()
    acc = DriveAccount(google_user_id=f"test-{uuid.uuid4()}", email="t@example.com", access_token="x",
                       granted_scopes=oauth_service.TRASH_SCOPE)
    db.add(acc)
    db.commit()
    base, other = picture(10), picture(11)
    images = {
        "orig": encode(base), "small": encode(base.resize((120, 90)), quality=50), "copy": encode(base),
        "other": encode(other), "broken": b"garbage", "nolink": encode(picture(12)),
    }
    rows = [
        mkfile("orig", "m-orig", size=900_000, day=1), mkfile("small", "m-small", size=200_000, day=2),
        mkfile("copy", "m-orig", size=900_000, day=3),                  # byte-identical to orig
        mkfile("other", "m-other"), mkfile("broken", "m-broken"), mkfile("nolink", "m-nolink"),
        mkfile("tiny", "m-tiny", size=1000),                            # below the size floor
        mkfile("trashed", "m-t", trashed=True),
    ]
    for r in rows:
        r.account_id = acc.id
        r.is_owned_by_user = True
    db.add_all(rows)
    db.commit()
    yield db, acc, FakeDrive(images, no_link={"nolink"})
    db.delete(acc)
    db.commit()
    db.close()


def hashed(db, acc):
    db.expire_all()
    return {f.google_file_id: f for f in db.scalars(select(DriveFile).where(DriveFile.account_id == acc.id))}


def test_hashing_groups_near_duplicates_and_reports_status(env):
    db, acc, drive = env
    res = nds.run_hashing(SessionLocal, drive, acc.id)
    assert res["hashed"] == 6 and res["retry_later"] == 0
    files = hashed(db, acc)
    assert files["orig"].perceptual_hash and files["broken"].perceptual_hash is None
    assert files["broken"].phash_md5 == "m-broken" and files["nolink"].phash_md5 == "m-nolink"   # not retried forever
    assert files["tiny"].phash_md5 is None and files["trashed"].phash_md5 is None                  # never eligible
    st = nds.status(db, acc.id)
    assert (st["eligible"], st["hashed"], st["unhashable"], st["pending"]) == (6, 4, 2, 0)
    groups = db.scalars(select(DuplicateGroup).where(DuplicateGroup.account_id == acc.id,
                                                     DuplicateGroup.detection_type == "near")).all()
    assert len(groups) == 1 and groups[0].file_count == 3
    entries = db.execute(select(DriveFile.google_file_id, DuplicateGroupFile.recommended_action)
                         .join(DriveFile, DriveFile.id == DuplicateGroupFile.drive_file_id)
                         .where(DuplicateGroupFile.duplicate_group_id == groups[0].id)).all()
    # keeps the largest, oldest file; the byte-identical copy and the small version are suggested for Trash
    assert dict(entries) == {"orig": "keep", "copy": "trash", "small": "trash"}
    assert groups[0].potential_savings == 900_000 + 200_000 + 900_000 - 900_000


def test_groups_are_rebuilt_from_saved_hashes_when_a_run_crashes(env):
    db, acc, drive = env
    listing = drive.list_image_thumbnails_page

    def fails_on_second_page(token=None):
        if token:
            raise RuntimeError("listing blew up")
        return listing(token)

    drive.list_image_thumbnails_page = fails_on_second_page
    with pytest.raises(RuntimeError):
        nds.run_hashing(SessionLocal, drive, acc.id)
    # Page 1 (orig, small) was hashed and saved before the crash, so its group exists right away.
    assert nds.status(db, acc.id)["groups"] == 1


def test_second_run_only_fetches_what_changed(env):
    db, acc, drive = env
    nds.run_hashing(SessionLocal, drive, acc.id)
    drive.fetched.clear()
    nds.run_hashing(SessionLocal, drive, acc.id)
    assert drive.fetched == []                                                   # nothing needs hashing
    f = hashed(db, acc)["other"]
    f.md5_checksum = "m-other-edited"                                            # file contents changed
    db.commit()
    nds.run_hashing(SessionLocal, drive, acc.id)
    assert drive.fetched == ["other"]


def test_transient_failures_are_retried_next_time_not_marked_done(env):
    db, acc, _ = env
    drive = FakeDrive(env[2].images, no_link={"nolink"}, flaky={"other"})
    res = nds.run_hashing(SessionLocal, drive, acc.id)
    assert res["retry_later"] == 1 and hashed(db, acc)["other"].phash_md5 is None
    drive.flaky.clear()
    nds.run_hashing(SessionLocal, drive, acc.id)
    assert hashed(db, acc)["other"].perceptual_hash is not None


def test_cancel_stops_after_the_current_page(env):
    db, acc, drive = env
    cancel = threading.Event()
    cancel.set()
    res = nds.run_hashing(SessionLocal, drive, acc.id, cancel)
    assert res["cancelled"] is True and res["hashed"] <= 2                       # one page of two files


def test_selections_survive_redetect_and_exact_groups_are_untouched(env):
    from app.services import duplicate_detector as dd

    db, acc, drive = env
    nds.run_hashing(SessionLocal, drive, acc.id)
    dd.rebuild(db, acc.id)                                                       # exact: orig + copy
    exact = db.scalars(select(DuplicateGroup).where(DuplicateGroup.account_id == acc.id,
                                                    DuplicateGroup.detection_type == "exact")).all()
    assert len(exact) == 1
    entry = db.scalars(select(DuplicateGroupFile).join(DriveFile, DriveFile.id == DuplicateGroupFile.drive_file_id)
                       .join(DuplicateGroup, DuplicateGroup.id == DuplicateGroupFile.duplicate_group_id)
                       .where(DriveFile.google_file_id == "small", DuplicateGroup.detection_type == "near")).one()
    entry.user_selected_action = "keep"
    db.commit()
    nds.detect(db, acc.id)
    dd.rebuild(db, acc.id)
    after = db.scalars(select(DuplicateGroupFile).join(DriveFile, DriveFile.id == DuplicateGroupFile.drive_file_id)
                       .join(DuplicateGroup, DuplicateGroup.id == DuplicateGroupFile.duplicate_group_id)
                       .where(DriveFile.google_file_id == "small", DuplicateGroup.detection_type == "near")).one()
    assert after.user_selected_action == "keep"
    assert db.scalar(select(DuplicateGroup).where(DuplicateGroup.account_id == acc.id,
                                                  DuplicateGroup.detection_type == "exact")) is not None


class TrashDrive:
    def __init__(self, live):
        self.live, self.calls = live, []

    def get_file(self, gid):
        return dict(self.live[gid])

    def set_trashed(self, gid, trashed):
        self.calls.append((gid, trashed))
        self.live[gid]["trashed"] = trashed


def test_cleanup_can_trash_a_near_duplicate_using_its_own_md5(env):
    """Near-duplicates have different md5s; the safety check must compare each file with itself."""
    db, acc, drive = env
    nds.run_hashing(SessionLocal, drive, acc.id)
    rows = db.execute(select(DuplicateGroupFile, DriveFile).join(DriveFile, DriveFile.id == DuplicateGroupFile.drive_file_id)
                      .join(DuplicateGroup, DuplicateGroup.id == DuplicateGroupFile.duplicate_group_id)
                      .where(DuplicateGroup.account_id == acc.id, DuplicateGroup.detection_type == "near")).all()
    for entry, f in rows:
        entry.user_selected_action = "trash" if f.google_file_id == "small" else "keep"
    db.commit()
    live = {f.google_file_id: {"md5Checksum": f.md5_checksum, "trashed": False, "ownedByMe": True,
                               "capabilities": {"canTrash": True}} for _, f in rows}
    td = TrashDrive(live)
    ops = cs.execute(db, acc.id, td, expected_count=1)
    assert [o.status for o in ops] == ["completed"] and td.calls == [("small", True)]
    db.expire_all()
    # the trashed file left the near group, which collapsed to the two byte-identical files and was dropped
    assert db.scalar(select(DuplicateGroup).where(DuplicateGroup.account_id == acc.id,
                                                  DuplicateGroup.detection_type == "near")) is None


def test_api(env, monkeypatch):
    db, acc, drive = env
    monkeypatch.setattr(oauth_service, "get_account", lambda _db: acc)
    monkeypatch.setattr(near_api.near_worker, "start", lambda account_id, client: nds.run_hashing(SessionLocal, client, account_id) and True)
    app.dependency_overrides[near_api.get_client] = lambda: drive
    app.dependency_overrides[near_api.get_preview_client] = lambda: drive
    near_api._previews.clear()
    try:
        c = TestClient(app)
        assert c.get("/api/near-duplicates/status").json()["pending"] == 6
        assert c.post("/api/near-duplicates/start").status_code == 202
        st = c.get("/api/near-duplicates/status").json()
        assert st["pending"] == 0 and st["groups"] == 1
        page = c.get("/api/duplicates?kind=near").json()
        assert page["total"] == 1 and page["items"][0]["detection_type"] == "near"
        assert c.get("/api/duplicates?kind=exact").json()["total"] == 0
        assert c.post("/api/near-duplicates/detect").json()["groups"] == 1
        t = c.get("/api/near-duplicates/thumbnail/orig")
        assert t.status_code == 200 and t.headers["content-type"] == "image/jpeg"
        drive.fetched.clear()
        assert c.get("/api/near-duplicates/thumbnail/orig").content == t.content
        assert drive.fetched == []                                   # second view served from memory
        f = hashed(db, acc)["orig"]
        f.md5_checksum = "m-orig-edited"                             # file changed: fetch a fresh preview
        db.commit()
        c.get("/api/near-duplicates/thumbnail/orig")
        assert drive.fetched == ["orig"]
        assert c.get("/api/near-duplicates/thumbnail/nope").status_code == 404
        assert c.get("/api/near-duplicates/thumbnail/orig?size=5").status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_cluster_applies_the_detail_check_to_every_member():
    a = 0xAAAA_5555_AAAA_5555
    items = [(1, a), (2, a ^ 1), (3, a ^ 2)]
    # 2 and 3 are close to 1 by hash, but only 2 passes the second-stage check against the keeper.
    assert perceptual.cluster(items, 4, bits=64, accept=lambda x, y: {x, y} != {1, 3}) == [[1, 2]]
    assert perceptual.cluster(items, 4, bits=64, accept=lambda x, y: False) == []


def test_fingerprint_rejects_a_slightly_different_shade():
    """Garment swatches in two close reds: same picture, small but systematic colour shift."""
    base = picture(5)
    shifted = Image.eval(base, lambda v: max(0, v - 5))  # every pixel a little darker in every channel
    assert not same(fp(base), fp(shifted))
    assert same(fp(base), fp(base.resize((120, 90)), quality=50))  # a small re-saved copy still matches
