"""Perceptual image fingerprints and near-duplicate clustering. Pure functions, no I/O.

A fingerprint is made from a small (256 px) Drive preview and has three parts:

* hash: a 256-bit difference hash (dHash): shrink to 17x16 greyscale and record whether each pixel is
  brighter than its right neighbour. It barely changes when an image is resized or re-compressed, so
  the number of differing bits (Hamming distance) is a fast first test of visual similarity.
* grey: the picture as 32x32 greyscale. Two candidates must correlate almost perfectly (>= 0.99), which
  separates pages of the same printed form and different frames of a burst; their layout is alike
  enough to fool the hash.
* colour: the picture as 8x8 colour cells. Nearly every cell must match, which separates images that
  differ only in colour (recoloured icons, colour-graded or black-and-white edits). A small but
  systematic shift (two swatches in slightly different reds) is caught by the colour bias: the mean
  signed difference per channel. Resizing only blurs edges, so its differences average out near zero.

The thresholds were calibrated on real photos: genuine re-saves (HEIC vs JPEG, resized or
re-compressed copies) pass all three; document pages, swatches and moving burst frames do not.
"""
import io
import operator
from collections import defaultdict
from dataclasses import dataclass

from PIL import Image, UnidentifiedImageError

VERSION = 2                  # stored per file; files fingerprinted by an older version are redone
THUMB_PX = 256               # preview size fetched from Drive
HASH_SIDE = 16
HASH_BITS = HASH_SIDE * HASH_SIDE
DEFAULT_MAX_DISTANCE = 24    # of 256 bits: candidate stage only, the detail checks below decide
MIN_CORRELATION = 0.99       # 32x32 greyscale, brightness/contrast normalised
MAX_COLOUR_DIFF = 6          # 90th-percentile 8x8 cell, largest RGB channel difference (0-255)
MAX_COLOUR_BIAS = 3.0        # mean signed difference per channel over the non-background cells
WHITE = 235                  # cells brighter than this in every channel count as background
GREY_SIDE, COLOUR_SIDE = 32, 8
DETAIL_BYTES = GREY_SIDE * GREY_SIDE + COLOUR_SIDE * COLOUR_SIDE * 3
MIN_GREY_SD = 3.0            # flat/blank images carry no structure to compare
BUCKET_CAP = 300             # skip degenerate buckets instead of comparing all pairs


class BadImage(Exception):
    pass


@dataclass(frozen=True)
class Fingerprint:
    hash: int
    detail: bytes  # GREY_SIDE^2 greyscale bytes, then COLOUR_SIDE^2 RGB triples


def fingerprint(data: bytes) -> Fingerprint:
    try:
        with Image.open(io.BytesIO(data)) as img:
            img.draft("RGB", (THUMB_PX, THUMB_PX))  # JPEG: decode at reduced size, much faster
            rgb = img.convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as err:
        raise BadImage(str(err)) from err
    grey = rgb.convert("L")
    px = grey.resize((HASH_SIDE + 1, HASH_SIDE), Image.Resampling.LANCZOS).tobytes()
    bits = 0
    w = HASH_SIDE + 1
    for row in range(HASH_SIDE):
        for col in range(HASH_SIDE):
            bits = (bits << 1) | (1 if px[row * w + col] > px[row * w + col + 1] else 0)
    detail = (grey.resize((GREY_SIDE, GREY_SIDE), Image.Resampling.BOX).tobytes()
              + rgb.resize((COLOUR_SIDE, COLOUR_SIDE), Image.Resampling.BOX).tobytes())
    return Fingerprint(bits, detail)


def to_hex(h: int, bits: int = HASH_BITS) -> str:
    return f"{h:0{bits // 4}x}"


def from_hex(s: str) -> int:
    return int(s, 16)


def distance(a: int, b: int) -> int:
    return (a ^ b).bit_count()


def is_informative(h: int, bits: int = HASH_BITS) -> bool:
    """Hashes that are almost all 0s or all 1s come from flat images and match each other by chance."""
    margin = max(6, bits * 3 // 32)
    return margin <= h.bit_count() <= bits - margin


class Detail:
    """Decoded detail bytes, ready for repeated comparisons (normalised grey, colour cells)."""

    __slots__ = ("z", "colour", "flat")

    def __init__(self, detail: bytes):
        n = GREY_SIDE * GREY_SIDE
        grey = detail[:n]
        mean = sum(grey) / n
        sd = (sum((p - mean) ** 2 for p in grey) / n) ** 0.5
        self.flat = sd < MIN_GREY_SD
        self.z = tuple((p - mean) / (sd or 1) for p in grey)
        self.colour = detail[n:]


def same_picture(a: Detail, b: Detail) -> bool:
    """Second stage for two hash candidates: near-identical structure AND near-identical colour."""
    if a.flat or b.flat:
        return False
    corr = sum(map(operator.mul, a.z, b.z)) / len(a.z)
    if corr < MIN_CORRELATION:
        return False
    ca, cb = a.colour, b.colour
    cells = sorted(max(abs(ca[i + k] - cb[i + k]) for k in range(3)) for i in range(0, len(ca), 3))
    if cells[int(0.9 * len(cells))] > MAX_COLOUR_DIFF:
        return False
    fg = [i for i in range(0, len(ca), 3) if min(ca[i:i + 3]) < WHITE or min(cb[i:i + 3]) < WHITE]
    if not fg:
        return True
    bias = max(abs(sum(ca[i + k] - cb[i + k] for i in fg)) / len(fg) for k in range(3))
    return bias <= MAX_COLOUR_BIAS


def cluster(items: list[tuple[int, int]], max_distance: int = DEFAULT_MAX_DISTANCE, bits: int = HASH_BITS,
            accept=None) -> list[list[int]]:
    """items: (key, hash), in order of preference (best copy first). Returns groups (size >= 2) in which
    EVERY member matches the group's first-preferred member, its suggested keeper: hash within
    max_distance bits and, if given, accept(keeper_key, member_key) is true.

    Step 1, candidates: pigeonhole. Split the hash into max_distance + 1 chunks; two hashes within
    max_distance bits of each other must be identical in at least one chunk, so only same-chunk pairs
    need comparing. Matching pairs are joined into connected components.
    Step 2, no chaining: a component can link A~B~C although A and C are far apart (burst shots, a
    slowly panning series), so it is split around centres. The most preferred remaining member takes
    everything still unassigned that matches it; repeat for the rest."""
    items = [(k, h) for k, h in items if is_informative(h, bits)]
    n_chunks = max_distance + 1
    bounds = [bits * i // n_chunks for i in range(n_chunks + 1)]
    parent = {k: k for k, _ in items}
    checked: dict[tuple[int, int], bool] = {}

    def matches(ka: int, ha: int, kb: int, hb: int) -> bool:
        if distance(ha, hb) > max_distance:
            return False
        if accept is None:
            return True
        pair = (ka, kb) if ka < kb else (kb, ka)
        if pair not in checked:
            checked[pair] = accept(ka, kb)
        return checked[pair]

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for c in range(n_chunks):
        lo, hi = bounds[c], bounds[c + 1]
        mask = (1 << (hi - lo)) - 1
        buckets: dict[int, list[tuple[int, int]]] = defaultdict(list)
        for k, h in items:
            buckets[(h >> lo) & mask].append((k, h))
        for bucket in buckets.values():
            if len(bucket) < 2 or len(bucket) > BUCKET_CAP:
                continue
            for i in range(len(bucket)):
                ki, hi_ = bucket[i]
                for j in range(i + 1, len(bucket)):
                    kj, hj = bucket[j]
                    if find(ki) != find(kj) and matches(ki, hi_, kj, hj):
                        parent[find(ki)] = find(kj)
    components: dict[int, list[tuple[int, int]]] = defaultdict(list)
    for k, h in items:  # keeps the caller's preference order inside each component
        components[find(k)].append((k, h))
    result = []
    for members in components.values():
        while len(members) >= 2:
            ck, ch = members[0]
            group = [members[0]] + [m for m in members[1:] if matches(ck, ch, m[0], m[1])]
            if len(group) >= 2:
                result.append(sorted(k for k, _ in group))
            taken = {k for k, _ in group}
            members = [m for m in members if m[0] not in taken]
    return result
