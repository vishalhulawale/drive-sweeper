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
docker-compose.yml   (PostgreSQL 16, backend and frontend images)
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

### Run everything in Docker

```powershell
copy backend\.env.example backend\.env   # fill in Google client, secret and TOKEN_ENCRYPTION_KEY
docker compose up -d --build              # db + backend (port 8000) + frontend (port 5173)
```

The backend container applies migrations on start and connects to the `db` service; `backend/.env` is read at run time and never copied into an image. The ports are the same as the native setup, so the Google OAuth origin and redirect URI do not change. Stop any natively running backend or frontend first, because they use the same ports. `docker compose up -d db` still starts only the database for native development.

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
| 4 | Storage analytics | Done (overview, by type, by year, largest folders and files) |
| 5 | Smart file organizer | Built and tested with a fake Drive; needs you to try a few moves on the real Drive |
| 6 | Incremental sync (Changes API) | Done and verified on the real Drive |
| 7 | Advanced features | Done (automatic sync, similar photos, Trash overview). Similar-photos analysis has run on the full Drive; review the large groups by eye (see the open finding below) |

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

### 2026-11-19 - Faster, all-or-nothing validation for organizer moves
- Each move made 4 Drive calls (the destination folder and the file were each fetched twice), moves ran one at a time inside the web request (up to 200 x 4 calls), and an unknown file partway through a batch returned an error after earlier files had already moved.
- `organizer_service.apply_moves` now validates the whole batch before changing anything. Each destination folder is checked live once per batch, each file is fetched once, and the moves run on 4 threads, with database work on the main thread as in Cleanup. A file listed twice in a batch is moved once. The safety checks are unchanged.
- Tests: 109 backend tests passing (3 new; all fail on the old code). Not tried on the real Drive, because that would move your files.

### 2026-11-19 - Faster cleanup runs (parallel Drive calls)
- Cleanup checked and trashed one file at a time: 2-3 Drive calls of about 0.4 s each per file, so thousands of files took an hour or more.
- `DriveClient` now builds a separate API client for each thread, since one httplib2 connection must not be shared between threads; this also makes the similar-photos listing prefetch safe. `cleanup_service.process` works in rounds of 40: each group's kept copy is verified once, then the live re-check and the move to Trash for each file run on 4 worker threads. All database work stays on the main thread, and workers see only plain ids and checksums. The safety checks are unchanged.
- Trade-off: **Cancel** now takes effect between rounds (at most 40 files later) instead of after the current file.
- Measured on your Drive (read-only): 40 file look-ups took 7.0 s on 4 threads, against about 15.8 s one at a time. Drive throttles sustained writes per user, so trashing may gain less; throttled calls are retried with backoff. Tests: 106 backend tests passing (3 new; all fail on the old code).

### 2026-11-19 - Faster photo previews
- Each preview request built a new Drive client, so it refreshed the OAuth token, opened new connections and looked up the link through the shared API client (not safe to use from several threads at once): about 2 s per preview, 18 s for a page of 25.
- Previews now reuse one client per account (a reconnect creates a new one), so the token is refreshed about once an hour and a refreshed token is saved. The link lookup uses each server thread's own connection, and the last 2,000 previews (about 10 MB) are kept in memory, keyed by file and MD5 so an edited photo is fetched again.
- Measured on your Drive with a page of 25 previews: 18.1 s before; 6.6 s on first view (about 1 s each); 0.84 s when viewed again. Tests: 103 backend tests passing (2 new).

### 2026-11-19 - README brought up to date
- The similar-photos analysis has now run on the full Drive: 12,309 of 12,347 eligible photos hashed and only **38** unreadable. The earlier estimate that "roughly half of your photos cannot be compared" (from the first listing page, which included many images that are not eligible) was wrong. After the grouping fix there are 830 groups covering 2,431 photos (up to 7.2 GB).
- Roadmap row for Phase 7 updated; thread counts in older entries corrected earlier today.

### 2026-11-19 - Docker Compose runs the whole app (product decision, was database only)
- The plan says "Deployment: Docker Compose", but the compose file only had PostgreSQL. Added `backend/Dockerfile` (Python 3.12 slim; runs `alembic upgrade head`, then uvicorn), `frontend/Dockerfile` (Node build, then nginx with a single-page-app fallback and long caching for hashed assets), `.dockerignore` files (so `.env` never goes into an image), and `backend` + `frontend` services with a database health check. See **Run everything in Docker** above.
- Validated: both images build. Started on spare ports beside your running dev servers, the backend container applied migrations, reached the database by service name and served your real data (`/api/health` ok, 263 duplicate groups), and the frontend served the app, including deep links such as `/cleanup`. The test containers were stopped afterwards.

### 2026-11-19 - UI redesign plan
- Reviewed the current UI (code and screenshots) and wrote [docs/redesign-plan.md](docs/redesign-plan.md): move from MUI to Cloudscape (the AWS console design system), Geist font, light theme by default with dark mode and density options in Settings, a new favicon, an AWS-console-style shell (top bar, grouped side menu, breadcrumbs, notifications, help panel), and a page-by-page redesign.
- Planned in 6 phases (foundation → dashboard → review pages → cleanup/trash → remaining pages → remove MUI). Nothing built yet.
- Added to the plan: loading and feedback rules (content-shaped placeholders, timing thresholds, optimistic updates with undo, prefetching, inline errors), interactive charts (space bar, folder treemap with drill-down, type/year charts linking to files, Trash deletion timeline, scan trend, photo compare view), and measurable UX targets.

### 2026-11-19 - SHA-256 verification of exact duplicates (product decision, was missing)
- The plan says duplicates are found by MD5 and verified with SHA-256, but `sha256_checksum` was never filled. Drive reports `sha256Checksum` as ordinary metadata (checked: all 940 files with an MD5 on one listing page have it), so no file content is downloaded.
- Scans and sync now store it (Drive's value always wins, like MD5). Exact groups need MD5 + size **and** SHA-256: a same-MD5 set whose SHA-256 values differ is split, files without a SHA-256 in such a set are left out, and sets with no SHA-256 at all fall back to MD5 (`hash_algorithm` is `md5+sha256` or `md5`). Cleanup also re-checks SHA-256 live, so a file whose SHA-256 changed is skipped.
- Real Drive: full scan of 25,225 files in 99 s; 23,750 of 23,906 files with an MD5 have a SHA-256; all 263 exact groups are verified as `md5+sha256`. No MD5 collisions were found, so the groups and the 208 MB of savings are unchanged.
- Tests: 102 backend tests passing (3 new, all fail on the old code; the old "SHA-256 is never overwritten" test now checks that Drive's value is used).

### 2026-11-19 - Fix: two syncs (or a sync and a scan) could run at once
- A manual **Sync now** did not check whether an automatic sync was already running, and a full scan could start in the middle of a sync. Both syncs would start from the same bookmark, apply the same changes twice and race on which bookmark was stored last. That was harmless (applying changes is idempotent) but wasteful.
- `sync_service` now holds a lock while a sync runs. A second sync gets a 409 ("A sync is already running"), the scheduler quietly tries again on a later tick, and starting or resuming a full scan during a sync gets a 409. Sync already refused to run during a scan.
- Tests: 100 backend tests passing (1 new).

### 2026-11-19 - Fix: similar-photo groups stayed stale after a crashed analysis
- The photo analysis regrouped only after a clean finish. When a run crashed, the hashes it had already saved were ignored until a later clean run (this is why the page showed 14 groups for so long).
- `run_hashing` now regroups in a `finally` step, so a crashed or stopped run still turns every saved hash into groups. A failure while regrouping is logged and does not hide the original error.
- Tests: 99 backend tests passing (1 new; it fails on the old code).

### 2026-11-19 - Fix: a full scan did not refresh duplicate groups
- Sync, cleanup and restore regrouped duplicates afterwards, but a full scan did not, so exact and similar-photo groups stayed stale until you clicked **Find duplicates** (new copies missing, removed ones still listed until the next regroup).
- `file_scanner.run_scan` now regroups both kinds once a scan completes (your keep/trash choices are kept). Failed and cancelled scans leave groups alone, and a regroup error is logged without marking a complete scan as failed.
- Real data: regrouping takes about 5 s (263 exact groups, 4,462 files, 208 MB). Tests: 98 backend tests passing (2 new; the regroup test fails on the old code).

### 2026-11-19 - Fix: cleanup and move history vanished when files left Drive
- `cleanup_operations.drive_file_id` was `ON DELETE CASCADE`. When a file is permanently deleted in Drive (Trash emptied, or the 30-day auto-delete), sync removes its row, and that deleted its trash/restore/move history too. This already happened: the history of the 2 files the app trashed is gone (the table was empty).
- Migration `f7b2c5d9e3a1`: the link is now `ON DELETE SET NULL`, and each history row stores a snapshot of the file (Drive id, name, size, link), backfilled for existing rows. History lists keep such rows and mark them **Deleted from Drive** (`file_deleted` in the API). Restore and Undo on them are refused with a clear message (409) instead of crashing.
- Tests: 96 backend tests passing (1 new; on the old code and schema the history row is deleted). Migration checked up, down and up again. Frontend typecheck and lint clean.
- **Restart the backend** to pick up this change (and the earlier fixes today); the migration is already applied.

### 2026-11-19 - Fix: network timeouts crashed cleanup, sync, scans and moves
- The Drive client retried only Google API errors (429/5xx). A socket timeout, connection reset or DNS hiccup went straight up and crashed whatever was running: one timeout during Cleanup marked every remaining queued file as failed, and sync, scans and organizer moves stopped. (This is what froze the similar-photos analysis at 1,739.)
- `DriveClient` now retries network errors (`OSError`, `httplib2` errors, token-refresh transport errors) with the same backoff as a 503, up to 6 attempts, then raises `DriveError`. Callers already handle `DriveError` one file or page at a time, so Cleanup records that one file as failed and carries on. Thumbnail downloads get the same treatment. The extra listing retry in the similar-photos job is no longer needed and was removed.
- Trashing is safe to retry. A retried move whose first attempt actually went through may be reported as failed although the file did move.
- Live check: one listing page and 5 thumbnails on the real Drive work as before. Tests: 95 backend tests passing (3 new; all fail on the old code).

### 2026-11-19 - Fix: a file in two groups could be queued twice or trash another group's kept copy
- A file can be in an exact-duplicate group and a similar-photos group at once (58 files on your Drive). The cleanup plan handled each group on its own, so such a file could be queued twice, and one group could keep a file that another group was trashing. Example: t1 is kept in the similar group (so x is trashed) while the exact group trashes t1, leaving no copy of x.
- `cleanup_service.build_plan` now decides globally: a file marked Trash in any group never counts as a kept copy, every file is queued at most once, and a group whose remaining copies are all being trashed is blocked ("keep at least one").
- Your current plan has nothing selected, so nothing was affected. Tests: 92 backend tests passing (1 new; it fails on the old code with t2 queued twice and x queued).

### 2026-11-19 - Fix: similar-photo groups chained unrelated photos together
- Grouping joined any two photos within 4 bits, so A~B~C landed in one group even when A and C were far apart. On your Drive this produced groups of 60, 54 and 44 photos, with members up to 16 bits from the suggested keeper, so "Trash all but the best" could have trashed photos that only resembled a neighbour.
- `perceptual.cluster` now splits each connected set around centres: the best copy (largest, then oldest) takes every unassigned photo within 4 bits of itself, then the next best remaining does the same. The suggested keeper is always the centre, so every photo in a group is within 4 bits of the photo you keep, and each photo is in one group only.
- Real Drive after re-grouping: 830 groups (was 783), 2,431 photos (was 2,510), up to 7.2 GB (was 8.1 GB); largest distance from a keeper is now 4 bits (was 16).
- **Still open (new finding):** a 64-bit greyscale fingerprint cannot tell some different images apart. Your largest groups are pages of one scanned document (54 pages), flat colour swatches that differ only in colour (44), and bursts of camera shots. Review these by eye; a stronger fingerprint is a separate fix.
- Tests: 91 backend tests passing (2 new; both fail on the old code).

### 2026-11-19 - Fix: "all groups" suggestions could mark similar photos for Trash
- Found in a requirements/implementation review. **Trash newer copies (all groups)** on the Duplicates page applied the suggestion to every group, including similar-photo groups, so one click would have marked about 1,700 visually similar (not identical) photos for Trash. No similar-photo choices had been recorded yet, so nothing was affected.
- `POST /api/duplicates/apply-suggestions` now takes `kind` (`exact` by default, or `near`) and only changes groups of that kind, for both `all_groups` and `group_ids`. The Similar photos page sends `near`.
- Tests: 89 backend tests passing (1 new; it fails on the old code). Frontend typecheck and lint clean.

### 2026-11-19 - Faster similar-photos scan
- Thumbnail hashing now uses parallel fetch threads (16, was 8; 32 caused timeouts), lists the next page of images while the current page is being hashed, and writes hashes with one bulk update per page instead of a lookup per file. Stopping now takes effect within the current page instead of after it.

### 2026-11-19 - Phase 7c: Trash overview
- New **Trash** page: how much space your Trash takes, how much Drive will delete automatically within 7 days, when the next automatic deletion is, and a sortable list (by size, by deletion date, by name) with a "trashed here" marker for files this app trashed. Drive deletes Trash items 30 days after they were trashed; until then they still count against your storage.
- **Emptying Trash is not built on purpose.** It is permanent, so the page explains this and links to Drive's Trash for you to do it yourself. Nothing in this app can permanently delete a file.
- `drive_files.trashed_time` (migration `e6a1b4c8d2f7`) is filled by scans and sync, set by Cleanup, and cleared on restore. For files trashed before this existed, **Fetch dates** does one metadata-only listing of the Trash (`POST /api/trash/refresh-dates`). API: `GET /api/trash/overview`, `GET /api/trash/items`.
- Counts only files you own; folders are counted separately; files shared with you are excluded because they do not use your storage.
- Live check: your Trash was **empty** when I tried it (the local inventory dropped from 29,210 to 25,225 items after the automatic sync at 06:18, matching the ~3,980 items that had been in Trash). The app has no permanent-delete code and had only trashed 2 files, so the Trash was emptied in Drive itself. The populated view is covered by tests only, not yet seen on real data.
- Tests: 88 backend tests passing (6 new). Frontend typecheck, lint and build clean. Not yet checked visually.

### 2026-11-19 - Phase 7b: near-duplicate (similar) photos
- Finds photos that look alike but are not byte-identical (resized, re-saved, lightly edited). `services/perceptual.py`: dHash fingerprint (64 bits from a 9x8 greyscale shrink) and clustering at Hamming distance 4 or less. Candidate pairs come from splitting the hash into 5 chunks (a pigeonhole guarantee that no pair within 4 bits is missed), flat/blank images are ignored, and oversized buckets are skipped so a bad hash cannot cause a runaway comparison.
- `services/near_duplicate_service.py` + `workers/near_worker.py`: a background job lists your images (metadata), fetches a **64 px thumbnail** of each (a few KB; the original files are never downloaded), hashes it with Pillow (new dependency) and stores the hash on the file row (migration `d5f9a3b7c1e2`). Resumable and committed page by page; a file is only re-hashed if its md5 changed; images under 30 KB are skipped; thumbnails that fail temporarily are retried next run, ones that cannot exist or decode are counted as unreadable. Thumbnails are fetched in parallel (16 threads; a network timeout only retries that file) and the next listing page is requested while the current one is hashed; Stop takes effect promptly.
- Groups are stored with `detection_type='near'`, so exact and near groups are kept apart (the exact rebuild no longer touches near groups). Keeper suggestion is the largest file (oldest on a tie); groups whose members are all byte-identical are left to exact detection. Your keep/trash choices survive re-grouping. After a cleanup, restore or sync, both kinds of groups are refreshed.
- Cleanup safety change: each file is now re-checked against **its own** recorded md5 (and the kept copy against its own), not a group-wide md5, because near duplicates differ byte-wise. For exact groups this is identical to before.
- API: `/api/near-duplicates` (`status`, `start`, `cancel`, `detect`, `thumbnail/{id}`) and `GET /api/duplicates?kind=near`. Similar photos page: analysis card with progress and Stop/Resume, previews side by side, Keep/Trash toggles, a "Trash all but the best" button, and a link to Cleanup.
- Live check on your Drive (one listing page and 3 thumbnails only; the full analysis has not been run): the Google calls work and thumbnails are 2-3 KB. **Only 520 of the first 1,000 images have a thumbnail link, so roughly half of your photos cannot be compared this way**; they are reported as unreadable, not silently dropped. The full run covers 12,347 eligible photos (30 KB or larger); at roughly 15 thumbnails per second that is around 15 minutes.
- Tests: 82 backend tests passing (11 new, using real generated images: resized and re-compressed copies match, different pictures do not). Frontend clean. Not yet checked visually.

### 2026-11-19 - Phase 7a: automatic background sync
- Phase 7 scope you chose: automatic background sync, near-duplicate photos, Trash overview. This is the first of the three.
- `workers/auto_sync.py`: a daemon thread wakes every 30 s and runs quick sync when it is due (default every 15 minutes, 5 minutes to 24 hours). It never runs while a full scan or another sync is running, backs off 5 minutes after a failure, records the last error, and treats a sync left `running` by a crashed server as idle at startup. Read-only; uses the same code and safety as the manual button.
- Settings (migration `c4e8f1a2b9d5`): on/off and interval, stored in `sync_state`; `PUT /api/sync/settings`; the Quick sync card on the dashboard has the switch, interval picker and shows the last automatic error. Default is on once a baseline exists.
- It only runs while the backend process is running, so it does not sync when your computer or the server is off.
- 71 backend tests passing (4 new, covering when a sync is due, success, failure and the settings API). Frontend clean.

### 2026-11-19 - Phase 6: incremental sync (Changes API)
- A full scan now takes a Changes bookmark (`getStartPageToken`) **before** it starts listing, so edits made during the scan are not missed, and publishes it to `sync_state` only when the scan completes (migration `b7d2e9a1c4f3`, `scan_jobs.changes_start_token`). If the bookmark call fails the scan still works and quick sync simply stays unavailable; an existing bookmark is never overwritten by a failed or partial scan.
- `services/sync_service.py`: `POST /api/sync` replays everything changed since the bookmark. Each page of changes and the advanced bookmark are saved in one transaction, so an interrupted sync resumes where it stopped and never skips changes; applying changes is idempotent. Within a page the last change per file wins. Removed files are deleted locally, trashed files are kept and flagged, new and edited files are upserted. If Google rejects the bookmark as expired, sync reports that a full scan is needed (409). Refused while a full scan is running. Duplicate groups are rebuilt afterwards (your keep/trash choices are kept). `GET /api/sync/status` reports availability and last sync time. Uses only the read-only scope.
- Verified on the real Drive: after one full scan (29,210 files, baseline stored), the first sync took about 3 s and applied 0 updates and 2 removals; a second sync straight after took about 1 s and found nothing. Compare with about 2 min 10 s for a full scan.
- Changes the app makes itself (Trash, moves) also come back through the feed; applying them is harmless because upserts are idempotent.
- Dashboard: new **Quick sync** card with Sync now and last-synced time; it is disabled until a full scan has set the baseline, and while a scan runs. Stats, duplicates, analytics and organizer suggestions refresh after a sync.
- Tests: 67 backend tests passing (9 new, using a fake Changes feed). Frontend typecheck, lint and build clean. The dashboard card has not been checked visually.
- Not built: automatic background syncing on a timer. Sync runs when you click it.

### 2026-11-19 - Phase 5: smart file organizer (suggest, move, undo)
- Scope you chose: suggest and move loose files into your **existing** folders. `services/organizer_service.py` describes each folder (at least 5 direct files) by its file types, the span of its modification dates and its filename patterns, then matches a loose file to the folder it most resembles. Score = 35% same-type share + 40% date fit + 25% name-pattern fit; a file is only suggested at 60% or more (80% is shown as high confidence). Metadata only, deterministic, and every suggestion lists its reasons (hover the confidence chip).
- "Loose" means an owned file at the top level (or directly inside a folder you pick via **Organize files in this folder** in the file explorer). Files inside shared-with-me folders are not loose, and only files and folders you own are used. Modification time is preferred over created time because of the bogus 1979 dates.
- Moves: `POST /api/organizer/apply` (max 200 per run, needs the same full Drive permission as cleanup) re-checks each file and folder live (owned, not trashed, Drive allows moving, not already there), then adds the new parent and removes the old one. Nothing is renamed or deleted. Each move is a `cleanup_operations` row (`move`) with the previous parents; `POST /api/organizer/operations/{id}/undo` moves it back (`unmove`). `GET /api/organizer/suggestions` is read-only.
- Real Drive result: 9 suggestions for the top level (1 high, 8 medium) in under a second. A first version suggested 48 because it treated files inside shared folders as loose; caught by comparing against a separate count of 17 loose files and fixed, with a regression test.
- Frontend: Organizer page (suggestions table, nothing pre-selected, "Select high confidence", Move, move history with Undo), sidebar entry, and a link from the file explorer.
- Tests: 58 backend tests passing (10 new). Frontend typecheck, lint and build clean. Not yet checked visually or run against the real Drive.

### 2026-11-19 - Fix: Cleanup history showed a finished file as pending
- Symptom: after moving two files to Trash, one showed completed and the other pending. The database and Drive were correct (both completed ~1.4 s apart, no run active); the page was stale. History only polled while a run was active, so the last poll caught the final file mid-flight and polling then stopped.
- Fix: history keeps polling while any row is pending, and the page refreshes everything once when a run ends. Frontend only; no backend change.

### 2026-11-19 - Phase 4: storage analytics
- `services/analytics_service.py` (read-only, from the local inventory): storage by type (images, videos, audio, documents, archives, other), storage by year created, largest files, largest folders (recursive, cycle-safe). Counts only files you own and that are not trashed; Trash is reported separately because Drive still counts it. API under `/api/analytics` (`overview`, `by-year`, `largest-files`, `largest-folders`).
- Real Drive: about 106 GB in 23,239 files (images 55.6 GB, videos 40.4 GB, archives 5.8 GB, documents 3.9 GB), 9.5 GB sitting in Trash, ~270 MB reclaimable from duplicates. Responses take 0.1-0.2 s. About 226 files carry a bogus 1979/1980 created date (a Drive upload artifact), so they show up under those years.
- Frontend: Analytics page with stat cards, bar charts (no chart library), largest folders linking into the file explorer, and a largest-files table. Sidebar entry added.
- 48 backend tests passing (6 new); frontend typecheck, lint and build clean. Not yet checked visually.

### 2026-11-19 - Cleanup handles all groups (background runs)
- Limit raised from 100 to 10,000 files per run. Because trashing thousands of files takes a long time (about 2-3 Drive calls per file, so roughly 20-30 minutes for ~4,200 files), `POST /api/cleanup/execute` now queues the work and returns 202; a background worker (`workers/cleanup_worker.py`) processes it. All the same per-file safety checks still apply.
- New `GET /api/cleanup/status` (progress) and `POST /api/cleanup/cancel` (stops files not yet processed; already-trashed files stay restorable). Queued operations are `pending` rows, so a server restart marks them failed and the selection can simply be run again. Only one run at a time (409 otherwise).
- Cleanup page: progress bar with Cancel remaining, preview table capped at 100 rows, thousands-separated counts.
- 42 backend tests passing (3 new); frontend clean. Not yet run against the real Drive.

### 2026-11-19 - Keep oldest, trash newer
- Rule confirmed: in each duplicate group the oldest copy (by created time) is kept, because newer copies are most likely copy-pasted duplicates. New buttons on the Duplicates page, **Trash newer copies (this page)** and **(all groups)**, record that choice in one click (`POST /api/duplicates/apply-suggestions` with `group_ids` or `all_groups`). Individual files can still be adjusted. Choices only; files move to Trash from the Cleanup page.
- 39 backend tests passing; frontend clean.

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
