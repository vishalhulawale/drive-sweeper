"""Perceptual image hashing (dHash) and near-duplicate clustering. Pure functions, no I/O.

dHash: shrink to 9x8 greyscale and record whether each pixel is brighter than its right neighbour.
That gives 64 bits that barely change when an image is resized, re-compressed or lightly edited, so
the number of differing bits (Hamming distance) measures how visually different two images are.
"""
import io
from collections import defaultdict

from PIL import Image, UnidentifiedImageError

HASH_BITS = 64
DEFAULT_MAX_DISTANCE = 4     # of 64 bits; conservative so groups are worth a human look
BUCKET_CAP = 300             # skip degenerate buckets (blank images) instead of comparing all pairs
MIN_SET_BITS = 6             # hashes that are almost all 0s or all 1s come from flat images


class BadImage(Exception):
    pass


def dhash_bytes(data: bytes) -> int:
    try:
        with Image.open(io.BytesIO(data)) as img:
            img.draft("L", (64, 64))  # JPEG: decode at reduced size, much faster
            small = img.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as err:
        raise BadImage(str(err)) from err
    px = small.tobytes()  # 72 greyscale values, row-major
    bits = 0
    for row in range(8):
        for col in range(8):
            bits = (bits << 1) | (1 if px[row * 9 + col] > px[row * 9 + col + 1] else 0)
    return bits


def to_hex(h: int) -> str:
    return f"{h:016x}"


def from_hex(s: str) -> int:
    return int(s, 16)


def distance(a: int, b: int) -> int:
    return (a ^ b).bit_count()


def is_informative(h: int) -> bool:
    ones = h.bit_count()
    return MIN_SET_BITS <= ones <= HASH_BITS - MIN_SET_BITS


def cluster(items: list[tuple[int, int]], max_distance: int = DEFAULT_MAX_DISTANCE) -> list[list[int]]:
    """items: (key, hash). Returns groups (size >= 2) of keys connected by distance <= max_distance.

    Pigeonhole: split the hash into max_distance + 1 chunks; two hashes within max_distance bits of
    each other must be identical in at least one chunk, so only same-chunk pairs need comparing."""
    items = [(k, h) for k, h in items if is_informative(h)]
    n_chunks = max_distance + 1
    bounds = [HASH_BITS * i // n_chunks for i in range(n_chunks + 1)]
    parent = {k: k for k, _ in items}

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
                    if distance(hi_, hj) <= max_distance:
                        ra, rb = find(ki), find(kj)
                        if ra != rb:
                            parent[ra] = rb
    groups: dict[int, list[int]] = defaultdict(list)
    for k, _ in items:
        groups[find(k)].append(k)
    return [sorted(g) for g in groups.values() if len(g) >= 2]
