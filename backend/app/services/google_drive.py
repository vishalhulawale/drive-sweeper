"""Thin Google Drive API v3 client with retry/backoff.

Kept separate from scanning and duplicate detection (principle 3). Writes are limited to set_trashed()
(to or from Trash), move_file() (change folder), and create_folder()/upload_file() for archive
extraction, which is also the only feature that downloads file contents. It never deletes anything permanently.
"""
import json
import logging
import os
import random
import re
import threading
import time
from collections.abc import Callable
from typing import Any
from urllib.parse import quote

import google_auth_httplib2
import httplib2
from google.auth.exceptions import TransportError
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload

log = logging.getLogger(__name__)

FILE_FIELDS = (
    "id,name,mimeType,size,md5Checksum,sha256Checksum,parents,createdTime,modifiedTime,"
    "ownedByMe,webViewLink,trashed,trashedTime,shortcutDetails(targetId),capabilities(canTrash,canMoveItemWithinDrive)"
)
LIST_FIELDS = f"nextPageToken,files({FILE_FIELDS})"
FOLDER_MIME = "application/vnd.google-apps.folder"
UPLOAD_FIELDS = "id,md5Checksum,size"
TRANSFER_CHUNK = 32 * 1024 * 1024      # download/upload chunk; a failed chunk is retried, not the whole file
SIMPLE_UPLOAD_MAX = 5 * 1024 * 1024    # larger files use a resumable upload


def _q(value: str) -> str:
    """Escape a value for a Drive query string literal."""
    return value.replace("\\", "\\\\").replace("'", "\\'")
PAGE_SIZE = 1000
MAX_ATTEMPTS = 6
_RETRY_REASONS = {"rateLimitExceeded", "userRateLimitExceeded", "backendError", "internalError"}
# Network-level failures: socket timeouts, connection resets, DNS hiccups, token-refresh transport errors.
# They say nothing about the request itself, so they are retried like a 503 and, if they persist,
# reported as DriveError so every caller's existing per-file / per-page error handling applies.
NETWORK_ERRORS = (OSError, httplib2.HttpLib2Error, TransportError)


class DriveError(Exception):
    pass


class NotFound(DriveError):
    """The file no longer exists in Drive (deleted permanently, or Trash was emptied)."""


class InvalidPageToken(DriveError):
    """The saved nextPageToken expired or is no longer valid; the listing must restart."""


def _reason(err: HttpError) -> str | None:
    try:
        return json.loads(err.content.decode())["error"]["errors"][0].get("reason")
    except Exception:
        return None


def _is_retryable(err: HttpError) -> bool:
    status = err.resp.status
    if status == 429 or status >= 500:
        return True
    return status == 403 and _reason(err) in _RETRY_REASONS


class DriveClient:
    def __init__(self, credentials, sleep: Callable[[float], None] = time.sleep, service: Any = None):
        self._sleep = sleep
        self._credentials = credentials
        self._local = threading.local()  # one HTTP connection per thread (httplib2 is not thread-safe)
        self._injected = service  # tests pass a fake service, shared by all threads
        if service is None:
            self._thread_service()  # build eagerly so a bad setup fails at construction, as before

    @property
    def _service(self):
        """The API client for the calling thread. httplib2 connections are not thread-safe, so every
        thread that uses this DriveClient (cleanup workers, the listing prefetch) gets its own."""
        return self._injected if self._injected is not None else self._thread_service()

    def _thread_service(self):
        svc = getattr(self._local, "service", None)
        if svc is None:
            http = google_auth_httplib2.AuthorizedHttp(self._credentials, http=httplib2.Http(timeout=60))
            svc = self._local.service = build("drive", "v3", http=http, cache_discovery=False)
        return svc

    def _execute(self, request, *, page_token: str | None = None):
        return self._retry(request.execute, page_token=page_token)

    def _retry(self, call: Callable[[], Any], *, page_token: str | None = None):
        """Run one API call (a request's execute, or one chunk of a download/upload) with backoff."""
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                return call()
            except HttpError as err:
                if page_token and err.resp.status == 400:
                    raise InvalidPageToken(str(err)) from err
                if err.resp.status == 404:
                    raise NotFound(f"Drive API error 404: {_reason(err) or err}") from err
                if _reason(err) == "insufficientPermissions":
                    raise DriveError(
                        "Google Drive permission not granted. Disconnect, reconnect, and tick the "
                        "Google Drive checkbox on Google's consent screen."
                    ) from err
                if not _is_retryable(err) or attempt == MAX_ATTEMPTS:
                    raise DriveError(f"Drive API error {err.resp.status}: {_reason(err) or err}") from err
                delay = min(60.0, 2 ** attempt) + random.uniform(0, 1)
                log.warning("Drive API %s (attempt %d/%d), retrying in %.1fs", err.resp.status, attempt, MAX_ATTEMPTS, delay)
                self._sleep(delay)
            except NETWORK_ERRORS as err:
                if attempt == MAX_ATTEMPTS:
                    raise DriveError(f"Network error talking to Google Drive: {type(err).__name__}: {err}") from err
                delay = min(60.0, 2 ** attempt) + random.uniform(0, 1)
                log.warning("Drive network error %s (attempt %d/%d), retrying in %.1fs",
                            type(err).__name__, attempt, MAX_ATTEMPTS, delay)
                self._sleep(delay)

    def list_files_page(self, page_token: str | None = None) -> tuple[list[dict], str | None]:
        """One page of the user's files (My Drive and shared-with-me). Returns (files, next_token)."""
        request = self._service.files().list(
            pageSize=PAGE_SIZE,
            pageToken=page_token,
            fields=LIST_FIELDS,
            spaces="drive",
            corpora="user",
            includeItemsFromAllDrives=False,
            supportsAllDrives=False,
        )
        result = self._execute(request, page_token=page_token)
        return result.get("files", []), result.get("nextPageToken")

    def get_file(self, file_id: str) -> dict:
        """Fresh metadata for one file (used to re-verify before any change)."""
        return self._execute(self._service.files().get(fileId=file_id, fields=FILE_FIELDS))

    def set_trashed(self, file_id: str, trashed: bool) -> dict:
        """Move a file to Trash (or restore it). Recoverable; never a permanent delete."""
        request = self._service.files().update(fileId=file_id, body={"trashed": trashed}, fields="id,trashed")
        return self._execute(request)

    def move_file(self, file_id: str, add_parent: str, remove_parents: list[str], extra_add: list[str] | None = None) -> dict:
        """Change a file's folder(s). Never renames or deletes; the move can be reversed."""
        add = ",".join([add_parent, *(extra_add or [])])
        request = self._service.files().update(
            fileId=file_id, addParents=add, removeParents=",".join(remove_parents) or None, fields=FILE_FIELDS
        )
        return self._execute(request)

    def get_start_page_token(self) -> str:
        """Bookmark for 'now' in the Changes feed."""
        return self._execute(self._service.changes().getStartPageToken(supportsAllDrives=False))["startPageToken"]

    def list_changes_page(self, page_token: str) -> tuple[list[dict], str | None, str | None]:
        """One page of changes since page_token. Returns (changes, next_page_token, new_start_token).
        Exactly one of the two tokens is set: next_page_token while more pages remain, else the
        new_start_token to store for next time."""
        request = self._service.changes().list(
            pageToken=page_token,
            pageSize=PAGE_SIZE,
            fields=f"nextPageToken,newStartPageToken,changes(fileId,removed,file({FILE_FIELDS}))",
            spaces="drive",
            includeItemsFromAllDrives=False,
            supportsAllDrives=False,
            includeRemoved=True,
        )
        result = self._execute(request, page_token=page_token)
        return result.get("changes", []), result.get("nextPageToken"), result.get("newStartPageToken")

    # ---- thumbnails (used for near-duplicate photo detection) ----

    def list_image_thumbnails_page(self, page_token: str | None = None) -> tuple[list[dict], str | None]:
        """One page of your image files with their short-lived thumbnail links."""
        request = self._service.files().list(
            q="mimeType contains 'image/' and trashed = false and 'me' in owners",
            pageSize=PAGE_SIZE,
            pageToken=page_token,
            fields="nextPageToken,files(id,thumbnailLink)",
            spaces="drive",
            corpora="user",
        )
        result = self._execute(request, page_token=page_token)
        return result.get("files", []), result.get("nextPageToken")

    def _thread_http(self):
        """This thread's own authorized connection (httplib2 connections must not be shared)."""
        http = getattr(self._local, "http", None)
        if http is None:
            http = google_auth_httplib2.AuthorizedHttp(self._credentials, http=httplib2.Http(timeout=30))
            self._local.http = http
        return http

    def get_thumbnail_link(self, file_id: str) -> str | None:
        """Thread-safe (uses this thread's connection, not the shared API client), so many previews can
        be looked up in parallel by the web server."""
        url = f"https://www.googleapis.com/drive/v3/files/{quote(file_id, safe='')}?fields=thumbnailLink"
        return json.loads(self._get(url, "Thumbnail link lookup")).get("thumbnailLink")

    def fetch_thumbnail(self, thumbnail_link: str, size: int = 64) -> bytes:
        """Download a small preview image (a few KB). The original file is never downloaded."""
        url = re.sub(r"=s\d+(-c)?$", "", thumbnail_link) + f"=s{size}"
        return self._get(url, "Thumbnail request")

    def _get(self, url: str, what: str) -> bytes:
        http = self._thread_http()
        for attempt in range(1, 4):
            try:
                resp, content = http.request(url, "GET")
            except NETWORK_ERRORS as err:
                if attempt == 3:
                    raise DriveError(f"{what} failed: {type(err).__name__}: {err}") from err
                self._sleep(2 ** attempt + random.uniform(0, 1))
                continue
            if resp.status == 200:
                return content
            if resp.status in (429, 500, 502, 503) and attempt < 3:
                self._sleep(2 ** attempt + random.uniform(0, 1))
                continue
            raise DriveError(f"{what} failed with HTTP {resp.status}")
        raise DriveError(f"{what} failed")

    # ---- archive extraction: the only place file contents are downloaded or files are created ----

    def download_to(self, file_id: str, path: str) -> None:
        """Stream a file's contents to a local path, in chunks, each retried on its own."""
        request = self._service.files().get_media(fileId=file_id)
        with open(path, "wb") as fh:
            downloader = MediaIoBaseDownload(fh, request, chunksize=TRANSFER_CHUNK)
            done = False
            while not done:
                _, done = self._retry(downloader.next_chunk)

    def create_folder(self, name: str, parent_id: str) -> str:
        body = {"name": name, "mimeType": FOLDER_MIME, "parents": [parent_id]}
        return self._execute(self._service.files().create(body=body, fields="id"))["id"]

    def find_folder(self, name: str, parent_id: str) -> str | None:
        """An existing (not trashed) folder with exactly this name directly inside parent_id."""
        q = (f"'{_q(parent_id)}' in parents and name = '{_q(name)}' and mimeType = '{FOLDER_MIME}' "
             "and trashed = false")
        files = self._execute(self._service.files().list(q=q, fields="files(id)", pageSize=10, spaces="drive")).get("files", [])
        return files[0]["id"] if files else None

    def list_children(self, folder_id: str) -> list[dict]:
        """Everything directly inside a folder (not trashed): id, name, mimeType, md5Checksum, size."""
        out, token = [], None
        while True:
            result = self._execute(self._service.files().list(
                q=f"'{_q(folder_id)}' in parents and trashed = false", pageSize=PAGE_SIZE, pageToken=token,
                fields="nextPageToken,files(id,name,mimeType,md5Checksum,size)", spaces="drive",
            ), page_token=token)
            out += result.get("files", [])
            token = result.get("nextPageToken")
            if not token:
                return out

    def upload_file(self, path: str, name: str, parent_id: str, mime_type: str) -> dict:
        """Create a new file from a local path. Large files use a resumable upload, and each chunk is
        retried on its own. Returns id, md5Checksum and size as Drive stored them."""
        size = os.path.getsize(path)
        body = {"name": name, "parents": [parent_id]}
        if size <= SIMPLE_UPLOAD_MAX:
            media = MediaFileUpload(path, mimetype=mime_type, resumable=False)
            return self._execute(self._service.files().create(body=body, media_body=media, fields=UPLOAD_FIELDS))
        media = MediaFileUpload(path, mimetype=mime_type, resumable=True, chunksize=TRANSFER_CHUNK)
        request = self._service.files().create(body=body, media_body=media, fields=UPLOAD_FIELDS)
        response = None
        while response is None:
            _, response = self._retry(request.next_chunk)
        return response

    def storage_quota(self) -> tuple[int | None, int]:
        """(limit, usage) in bytes; limit is None for unlimited storage. Trash counts towards usage."""
        q = self._execute(self._service.about().get(fields="storageQuota(limit,usage)"))["storageQuota"]
        return (int(q["limit"]) if q.get("limit") else None), int(q.get("usage", 0))

    # ---- Trash ----

    def list_trashed_page(self, page_token: str | None = None) -> tuple[list[dict], str | None]:
        """One page of items in Trash with when each was trashed (metadata only)."""
        request = self._service.files().list(
            q="trashed = true and 'me' in owners",
            pageSize=PAGE_SIZE,
            pageToken=page_token,
            fields="nextPageToken,files(id,trashedTime)",
            spaces="drive",
            corpora="user",
        )
        result = self._execute(request, page_token=page_token)
        return result.get("files", []), result.get("nextPageToken")
