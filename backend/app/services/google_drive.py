"""Thin Google Drive API v3 client: metadata listing only, with retry/backoff.

Kept separate from scanning and duplicate detection (principle 3). The only write it can do is
set_trashed() (to or from Trash) and move_file() (change folder). It never deletes anything permanently.
"""
import json
import logging
import random
import re
import threading
import time
from collections.abc import Callable
from typing import Any

import google_auth_httplib2
import httplib2
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

log = logging.getLogger(__name__)

FILE_FIELDS = (
    "id,name,mimeType,size,md5Checksum,parents,createdTime,modifiedTime,"
    "ownedByMe,webViewLink,trashed,trashedTime,shortcutDetails(targetId),capabilities(canTrash,canMoveItemWithinDrive)"
)
LIST_FIELDS = f"nextPageToken,files({FILE_FIELDS})"
PAGE_SIZE = 1000
MAX_ATTEMPTS = 6
_RETRY_REASONS = {"rateLimitExceeded", "userRateLimitExceeded", "backendError", "internalError"}


class DriveError(Exception):
    pass


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
        if service is not None:  # injected in tests
            self._service = service
        else:
            http = google_auth_httplib2.AuthorizedHttp(credentials, http=httplib2.Http(timeout=60))
            self._service = build("drive", "v3", http=http, cache_discovery=False)

    def _execute(self, request, *, page_token: str | None = None):
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                return request.execute()
            except HttpError as err:
                if page_token and err.resp.status == 400:
                    raise InvalidPageToken(str(err)) from err
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
        request = self._service.files().update(fileId=file_id, body={"trashed": trashed}, fields=FILE_FIELDS)
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

    def get_thumbnail_link(self, file_id: str) -> str | None:
        return self._execute(self._service.files().get(fileId=file_id, fields="thumbnailLink")).get("thumbnailLink")

    def fetch_thumbnail(self, thumbnail_link: str, size: int = 64) -> bytes:
        """Download a small preview image (a few KB). The original file is never downloaded."""
        url = re.sub(r"=s\d+(-c)?$", "", thumbnail_link) + f"=s{size}"
        http = getattr(self._local, "http", None)
        if http is None:
            http = google_auth_httplib2.AuthorizedHttp(self._credentials, http=httplib2.Http(timeout=30))
            self._local.http = http
        for attempt in range(1, 4):
            resp, content = http.request(url, "GET")
            if resp.status == 200:
                return content
            if resp.status in (429, 500, 502, 503) and attempt < 3:
                self._sleep(2 ** attempt + random.uniform(0, 1))
                continue
            raise DriveError(f"Thumbnail request failed with HTTP {resp.status}")
        raise DriveError("Thumbnail request failed")

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

