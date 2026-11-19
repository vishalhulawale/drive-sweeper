# DriveClean

A personal Google Drive storage management and exact-deduplication app. It scans a Drive, builds a local metadata inventory in PostgreSQL, finds exact duplicate files, and lets the user manually review them and move selected files to Drive Trash. Nothing is ever deleted automatically or permanently.

> **This README is the progress log.** It is updated every time work progresses (see [Progress Log](#progress-log)).

## Product Decisions

| Decision | Selection |
|---|---|
| Scope | Personal use initially, multi-user possible later |
| Frontend | React + TypeScript (Vite), Material UI, TanStack Query, Axios |
| Backend | Python + FastAPI, SQLAlchemy 2.x, Alembic |
| Database | PostgreSQL 16 |
| Duplicate detection | Exact content-based (MD5, SHA-256 verification) |
| Cleanup | Manual approval only, move to Drive Trash |
| Integration | Google Drive API v3, Google OAuth 2.0 |
| Deployment | Docker Compose |

Google Drive stays the source of truth. PostgreSQL stores metadata, scan state and duplicate analysis only, never file copies.

## Architecture

```
React Frontend --REST--> FastAPI Backend
                           |-- Auth / Drive service / Scanner
                           |-- Duplicate detection / Storage analyzer / Cleanup manager
                           |-- PostgreSQL
                           '-- Google Drive API
Background worker: scanning, metadata sync, hashing, duplicate grouping, analytics
```

Design principles: modular monolith, no business logic in route handlers, resumable and idempotent scans, all destructive actions manual, migrations for every schema change, unit tests for scanning and duplicate detection.

## Repository Layout

```
backend/
  app/
    api/ core/ models/ schemas/ repositories/ services/ workers/ utils/
    main.py
  migrations/        (Alembic; initial schema migration applied)
  tests/
  requirements.txt
  .env.example
frontend/            (Vite + React + TypeScript + MUI; pages, hooks, services, types)
docker-compose.yml   (PostgreSQL 16)
```

## Local Development

Prerequisites: Python 3.12, Node.js, Docker Desktop.

```powershell
# Database
docker compose up -d db

# Backend
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
copy .env.example .env        # then fill in values
.\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
.\.venv\Scripts\python -m pytest

# Frontend
cd frontend
npm install
npm run dev                    # http://localhost:5173
```

Health check: `GET http://localhost:8000/api/health`.

## Google Cloud Setup (Milestone 1.2, manual)

1. Create a Google Cloud project (`driveclean`) and enable **Google Drive API**.
2. Configure the OAuth consent screen (External, status Testing) and add your own account as a test user.
3. Add scope `drive.metadata.readonly` for scanning. Add the broader `drive` scope only when the Trash feature is built (Phase 3).
4. Create an OAuth client of type **Web application**:
   - Authorized JavaScript origin: `http://localhost:5173`
   - Authorized redirect URI: `http://localhost:8000/api/auth/google/callback`
5. Put the client ID and secret in `backend/.env` and generate `TOKEN_ENCRYPTION_KEY` (Fernet).

Notes: in Testing mode refresh tokens expire after 7 days; the "unverified app" warning at sign-in is expected for a personal app. Never commit `.env`.

## Roadmap

| Phase | Goal | Status |
|---|---|---|
| 1 | Foundation and Google Drive integration (inventory) | Done (UI checked, backend restart issue fixed) |
| 2 | Exact duplicate detection and review UI | Done (detection, API and review UI built) |
| 3 | Manual cleanup (Trash, history, restore) | Built and tested with a fake Drive; needs you to grant the Trash permission and try it on a small selection |
| 4 | Storage analytics | Not started |
| 5 | Smart file organizer | Not started |
| 6 | Incremental sync (Changes API) | Not started |
| 7 | Advanced features | Not started |

### Phase 1 milestones

| Milestone | Status |
|---|---|
| 1.1 Project initialisation | Done |
| 1.2 Google Cloud configuration | Done (user configured `.env`) |
| 1.3 OAuth authentication | Done and verified live (frontend connect screen comes in 1.7) |
| 1.4 Database setup (models, Alembic) | Done |
| 1.5 Google Drive client | Done (unit-tested with simulated errors) |
| 1.6 File scanner | Done, verified on the real Drive |
| 1.7 Frontend integration | Done |

### Phase 1 checklist

- [x] React application initialised
- [x] FastAPI application initialised
- [x] PostgreSQL configured
- [x] Google Cloud project created
- [x] Google Drive API enabled
- [x] OAuth credentials generated
- [x] Google OAuth flow implemented (verified with a real Google login)
- [x] Secure token persistence implemented (Fernet-encrypted at rest)
- [x] Google Drive client implemented
- [x] File metadata retrieval implemented
- [x] Pagination implemented
- [x] File metadata stored in PostgreSQL
- [x] Folder relationships stored
- [x] Scan progress implemented
- [x] Scan checkpointing implemented
- [x] Scan resumption implemented (unit-tested; full real scan ran uninterrupted)
- [x] File inventory displayed in React (built, awaiting browser check)

## Progress Log

Newest first.

### 2026-11-19 - Fix: choosing files to delete was unclear
- A highlighted "Trash" button on the Duplicates page was only a suggestion, so Cleanup showed "Nothing selected". Now clicking the suggestion records it, and "Use suggestions for this page" records all suggestions at once (`POST /api/duplicates/apply-suggestions`, records choices only). The page also links to Cleanup and explains the two-step flow: mark Trash on Duplicates, then Move to Trash on Cleanup.
- 39 backend tests passing; frontend clean.

### 2026-11-19 - Phase 3: manual cleanup (Trash, history, restore)
- Permission: the app still scans with the read-only scope. Moving files to Trash needs the full `drive` scope, requested only when you click **Allow cleanup** (`/api/auth/google?upgrade=trash`). New column `drive_accounts.granted_scopes` (migration `a3c1d0e4f5b6`, applied); `/api/auth/status` now reports `can_trash`.
- `services/cleanup_service.py`: only files you marked **Trash** are touched (suggestions are never acted on). Every group must keep at least one copy, and that copy is re-checked live in Drive. Each file is re-checked right before the change (not already trashed, owned by you, MD5 unchanged, Drive allows trashing). Trash only, never permanent delete. Per-file results are recorded in `cleanup_operations` (completed, skipped, failed) with previous parents, then duplicate groups are rebuilt.
- API: `GET /api/cleanup/plan`, `POST /api/cleanup/execute` (needs `expected_count` matching the plan, max 100 files per run, 403 without the Trash permission), `GET /api/cleanup/operations`, `POST /api/cleanup/operations/{id}/restore`.
- Frontend: Cleanup page with a permission banner, the plan table (file to trash vs copy you keep), a confirmation dialog, and history with Restore.
- Tests: 39 backend tests passing (9 new, using a fake Drive client). Frontend typecheck, lint and build clean. Not yet run against the real Drive.
- Fixed a typo in `App.tsx` (`path="scans"element`) that I introduced in the Phase 2 commit; it built but was fragile.

### 2026-11-19 - Phase 2 started: exact duplicate detection and review UI
- Phase 1 closed. The intermittent "Not found" errors were a stale uvicorn started before the files API existed (no `--reload`); restarting with `--reload` fixed it. Note: on Windows, `--reload` can hang after a scan thread ran; if new routes 404, kill uvicorn and start it again.
- `services/duplicate_detector.py`: groups by MD5 + size over live, owned, non-shortcut, non-Google-native, non-empty files. Rebuild is idempotent and keeps the user's earlier keep/trash choices. Recommended keeper is the oldest copy (ties: shorter name, then id). Read-only: nothing changes in Drive.
- API: `POST /api/duplicates/detect`, `GET /api/duplicates` (sort by savings, copies, or file size; paged), `GET /api/duplicates/summary`, `GET /api/duplicates/{id}`, `PUT /api/duplicates/entries/{id}/selection` (keep / trash / clear).
- Real Drive result: **268 groups, 4,472 files, about 270 MB reclaimable**. This replaces the raw 2,578-group preview, which counted trashed, shared and empty files.
- Frontend: new Duplicates page (sidebar entry) with group cards, per-file Keep/Trash toggles, suggested action chips, sort and pagination. Selections are only recorded; actual trashing is Phase 3.
- Tests: 30 backend tests passing (4 new). Frontend typecheck, lint and build clean. Not yet checked visually.

### 2026-11-18 - Milestone 1.7: files API and frontend
- Backend: `GET /api/files` (parent folder or `root`, name search across the Drive with LIKE wildcards escaped, kind filter folder/file/doc, show-trashed, sort by name/size/modified/created, pagination up to 200), `GET /api/files/summary`, `GET /api/files/tree?parent=`, `GET /api/files/{id}`, `/children`, `/path` (breadcrumb). "Top level" means no parent or a parent that was never listed, because Drive does not return the My Drive root folder; this also surfaces shared-with-me items.
- Verified on the real inventory: 29,210 items, 148 top-level entries (34 folders), search and size sort correct (largest file 15.2 GB), responses about 0.3 s.
- Frontend: connect screen with friendly error messages (denied, missing Drive permission), dashboard with scan start/resume/cancel, live progress (polls every 2 s while scanning) and summary cards, file explorer (folder navigation with breadcrumb, search, sorting, trashed toggle, pagination, "open in Drive" link, shared/trashed badges), scan history table, settings with a two-step disconnect. State lives in the URL for the explorer so back/forward works.
- Tests: 26 backend tests passing (adds query/filter/escape/sort/tree/breadcrumb/summary against a seeded test account). Frontend: TypeScript, lint and production build are clean; dev server serves. Not yet checked visually in a browser.
- Dev note: restart uvicorn after pulling backend changes (it does not auto-reload unless started with `--reload`).

### 2026-11-18 - First real Drive scan
- After re-granting the Drive permission and enabling the Drive API in the Cloud project, scan #34 completed: **29,210 files in ~2 min 10 s** (about 220 files/s), no errors.
- Inventory: 1,252 folders, 67 Google-native docs, 27,891 files with an MD5, 3,980 trashed items, 724 shared (not owned) items, 120 items without a parent (mostly shared-with-me), about 112 GB of reported sizes (includes trashed items).
- Rough preview of Phase 2: about 2,578 groups of files share MD5 and size. This raw figure still includes trashed and non-owned files, so duplicate detection must exclude trashed items and treat shared files carefully before any savings number is trusted.
- Cleaned up a leftover test account created by an interrupted test run.
- Next: Milestone 1.7, the frontend (connect screen, scan progress, file and folder browser), which needs `GET /api/files` and `GET /api/files/tree` endpoints.

### 2026-11-18 - Milestones 1.5 and 1.6: Drive client and resumable scanner
- `services/google_drive.py`: metadata-only Drive v3 client (`files.list`, pageSize 1000, requested fields from the plan plus `ownedByMe`). Retries 429/5xx and rate-limit 403s with exponential backoff and jitter (max 6 attempts); raises `InvalidPageToken` for a stale page token; 60 s HTTP timeout. Never modifies files.
- `services/file_scanner.py`: each page is upserted and its `next_page_token` checkpoint saved in one transaction, so resume never skips data. Idempotent upsert on `(account_id, google_file_id)`; locally computed `sha256_checksum` is never overwritten. Handles folders, Google-native docs (no size/MD5), shortcuts (target id), multiple parents, ownership. After a complete scan, rows no longer returned by Drive are removed from the local inventory. An expired page token restarts the listing (capped at 3 restarts, then the scan fails instead of looping).
- `workers/scan_worker.py`: runs scans in a background thread with its own DB session (Celery later; the `scan_jobs` table is the contract). Orphaned running jobs are marked `interrupted` at startup and can be resumed.
- `api/scans.py`: `POST /api/scans` (409 if one is active), `GET /api/scans`, `GET /api/scans/{id}`, `POST /api/scans/{id}/resume`, `POST /api/scans/{id}/cancel`. Cancellation is checked between pages.
- Bugs found and fixed while testing: an infinite restart loop on a perpetually expiring page token; stale-file sweep depended on DB-server clock vs app clock (now stamped by the app clock).
- Tests: 18 passing (parsing variants, idempotent re-scan, crash then resume from checkpoint, expired token, restart cap, stale removal, cancellation, sha256 preservation, retry/backoff, permission errors).
- First real scan failed with `403 insufficientPermissions`: the stored token was granted only `openid` + `email`; the Drive permission box was unticked on Google's consent screen. Login now rejects such grants (`?auth_error=missing_drive_scope`) and the scan error explains the fix. Action for the user: disconnect, reconnect, and tick the Drive checkbox.

### 2026-11-18 - Live OAuth login verified
- Completed a real Google login end to end: callback redirected to the frontend, `GET /api/auth/status` returns connected, and the `drive_accounts` row holds Fernet-encrypted access and refresh tokens.
- Next: Milestone 1.5 (Drive API client with pagination, retry/backoff, rate limits) and 1.6 (resumable scanner).

### 2026-11-18 - OAuth login hardening
- Hit `Invalid OAuth state` / `OAuth state mismatch` during the first live login attempt. Root cause: state was tied to a per-browser cookie, which breaks with overlapping tabs, retries, or `127.0.0.1` vs `localhost`.
- Pending logins are now stored server-side keyed by OAuth state (with PKCE verifier, 10-minute TTL, single use); cookies are no longer used. Trade-off: pending logins are lost if the server restarts mid-login, and state is not bound to the browser (acceptable for a local personal app; revisit for multi-user).
- Earlier `403 access_denied` was caused by the `.env` client ID belonging to another Google Cloud project ("District Dashboard") in Testing mode. Use a client from the DriveClean project and add yourself as a test user.

### 2026-11-18 - Milestones 1.3 and 1.4: database and OAuth backend
- Added SQLAlchemy 2 models for all seven tables (`drive_accounts`, `drive_files`, `duplicate_groups`, `duplicate_group_files`, `scan_jobs`, `cleanup_operations`, `sync_state`). `drive_files` has a unique `(account_id, google_file_id)` constraint and indexes on size, MD5 and parent folder. Parent lists use JSONB (`parent_ids`, `previous_parent_ids`).
- Initialised Alembic wired to app settings and model metadata; generated and applied the initial migration to the Docker Postgres.
- `core/security.py`: Fernet encryption for OAuth tokens at rest.
- `services/oauth_service.py`: authorization-code flow with PKCE, `access_type=offline` + `prompt=consent` so a refresh token is always issued, ID-token verification, upsert of the account, token revoke on disconnect.
- Scopes requested: `openid`, `userinfo.email`, `drive.metadata.readonly` only (read-only, least privilege).
- `api/auth.py`: `GET /api/auth/google`, `GET /api/auth/google/callback` (state checked against an httponly cookie), `GET /api/auth/status`, `POST /api/auth/disconnect`.
- Tests: 6 passing (token round-trip, status shape, login redirect/scope/offline, bad-state rejection, schema tables present).
- To try the login now: run the backend and open `http://localhost:8000/api/auth/google`.
- Note: Windows reported a low-memory (paging file) error once while running Docker; if Docker commands fail, free memory or restart Docker Desktop.

### 2026-11-18 - Milestone 1.1: project scaffold
- Created backend skeleton following the planned structure; added config (pydantic-settings), SQLAlchemy engine/session/Base, CORS for the frontend origin, and `GET /api/health` with a passing test.
- `requirements.txt`: FastAPI, uvicorn, SQLAlchemy 2, Alembic, psycopg 3, Google auth/API clients, cryptography, pytest, httpx.
- Created frontend with Vite + React + TypeScript; added MUI, TanStack Query, Axios, React Router. Production build succeeds.
- Added `docker-compose.yml` (PostgreSQL 16), `.gitignore`, `backend/.env.example`.
- Wrote Google Cloud configuration steps (Milestone 1.2).
- Open: Docker daemon was not running, so the Postgres container has not been started or connected to.

## Working Agreement

- Update this README after every unit of progress (progress log, milestone table, checklist).
- Commit and push to `origin/main` as work progresses.
- Destructive Drive actions stay manual; never permanently delete files.
