"""Read zip, tar and rar archives the same way: a list of safe file entries, each opened as a stream.

Safety: entries are never extracted by path. Each name is split into parts and rejected if it is
absolute, has a drive letter or climbs out with "..", so nothing can land outside its folder. Links,
devices and macOS metadata (__MACOSX/, .DS_Store) are ignored. Password-protected archives are refused.
"""
import os
import re
import shutil
import tarfile
import zipfile
from collections.abc import Callable
from dataclasses import dataclass
from typing import IO

import rarfile

from app.core.config import settings

# Longest first so "x.tar.gz" loses ".tar.gz", not just ".gz".
EXTENSIONS = {
    ".tar.gz": "tar", ".tar.bz2": "tar", ".tar.xz": "tar", ".tgz": "tar", ".tbz2": "tar", ".txz": "tar",
    ".tar": "tar", ".zip": "zip", ".rar": "rar",
}
NAME_PATTERN = r"\.(zip|rar|tar|tar\.gz|tgz|tar\.bz2|tbz2|tar\.xz|txz)$"  # for SQL (~*), same list
IGNORED_NAMES = {".DS_Store", "Thumbs.db", "desktop.ini"}
_WINRAR = r"C:\Program Files\WinRAR\UnRAR.exe"


class ArchiveError(Exception):
    """The archive cannot be extracted (corrupt, password-protected, unsupported)."""


@dataclass
class Entry:
    parts: tuple[str, ...]  # folder names then the file name, all safe
    size: int
    open: Callable[[], IO[bytes]]


def kind_of(name: str) -> str | None:
    low = name.lower()
    for ext, kind in EXTENSIONS.items():
        if low.endswith(ext):
            return kind
    return None


def folder_name_for(name: str) -> str:
    """The archive's name without its archive extension: "Photos 2019.zip" -> "Photos 2019"."""
    low = name.lower()
    for ext in EXTENSIONS:
        if low.endswith(ext) and len(name) > len(ext):
            return name[: -len(ext)].strip() or name
    return name


def safe_parts(name: str) -> tuple[str, ...] | None:
    """Path parts of an entry name, or None if it is unsafe or should be ignored."""
    parts = [p for p in name.replace("\\", "/").split("/") if p not in ("", ".")]
    if not parts or ".." in parts or re.match(r"^[A-Za-z]:$", parts[0]) or name.startswith(("/", "\\")):
        return None
    if parts[0] == "__MACOSX" or parts[-1] in IGNORED_NAMES:
        return None
    return tuple(parts)


def rar_supported() -> bool:
    try:
        _setup_rar()
        return True
    except ArchiveError:
        return False


def _setup_rar() -> None:
    tool = settings.unrar_tool or shutil.which("unrar") or (_WINRAR if os.path.exists(_WINRAR) else "")
    if tool:
        rarfile.UNRAR_TOOL = tool
    try:
        rarfile.tool_setup()
    except rarfile.RarCannotExec as err:
        raise ArchiveError("RAR archives need unrar, unar, bsdtar or 7z on the server") from err


class Archive:
    """Open with `with Archive(path, kind) as a:`; then a.entries and a.ignored."""

    def __init__(self, path: str, kind: str):
        self.path, self.kind = path, kind
        self.entries: list[Entry] = []
        self.ignored = 0
        self._handle = None

    def __enter__(self) -> "Archive":
        try:
            getattr(self, f"_open_{self.kind}")()
        except ArchiveError:
            self.close()
            raise
        except (zipfile.BadZipFile, tarfile.TarError, rarfile.Error, EOFError, OSError) as err:
            self.close()
            raise ArchiveError(f"Cannot read the archive: {err}") from err
        # The same path twice (re-added files): the last one wins, as an unzip tool would leave it.
        unique = {e.parts: e for e in self.entries}
        self.ignored += len(self.entries) - len(unique)
        self.entries = sorted(unique.values(), key=lambda e: e.parts)
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    def close(self) -> None:
        if self._handle is not None:
            self._handle.close()
            self._handle = None

    def _add(self, name: str, size: int, opener) -> None:
        parts = safe_parts(name)
        if parts is None:
            self.ignored += 1
        else:
            self.entries.append(Entry(parts, size, opener))

    def _open_zip(self) -> None:
        z = self._handle = zipfile.ZipFile(self.path)
        for info in z.infolist():
            if info.is_dir():
                continue
            if info.flag_bits & 0x1:
                raise ArchiveError("The archive is password-protected")
            if (info.external_attr >> 16) & 0o170000 == 0o120000:  # symbolic link
                self.ignored += 1
                continue
            self._add(info.filename, info.file_size, lambda i=info: z.open(i))

    def _open_tar(self) -> None:
        t = self._handle = tarfile.open(self.path, "r:*")
        for m in t.getmembers():
            if m.isdir():
                continue
            if not m.isfile():  # links, devices, fifos
                self.ignored += 1
                continue
            self._add(m.name, m.size, lambda m=m: t.extractfile(m))

    def _open_rar(self) -> None:
        _setup_rar()
        r = self._handle = rarfile.RarFile(self.path)
        if r.needs_password():
            raise ArchiveError("The archive is password-protected")
        for info in r.infolist():
            if info.is_dir():
                continue
            if info.is_symlink() or info.needs_password():
                if info.needs_password():
                    raise ArchiveError("The archive is password-protected")
                self.ignored += 1
                continue
            self._add(info.filename, info.file_size, lambda i=info: r.open(i))
