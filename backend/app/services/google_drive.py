"""Thin Google Drive API v3 client: metadata listing only, with retry/backoff.

Kept separate from scanning and duplicate detection (principle 3). Never modifies files.
"""
import json
import logging
import random
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
    "ownedByMe,webViewLink,trashed,shortcutDetails(targetId),capabilities(canTrash)"
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
