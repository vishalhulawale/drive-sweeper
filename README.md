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
frontend/            (Vite + React + TypeScript)
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
| 1 | Foundation and Google Drive integration (inventory) | In progress |
| 2 | Exact duplicate detection and review UI | Not started |
| 3 | Manual cleanup (Trash, history, restore) | Not started |
| 4 | Storage analytics | Not started |
| 5 | Smart file organizer | Not started |
| 6 | Incremental sync (Changes API) | Not started |
| 7 | Advanced features | Not started |

### Phase 1 milestones

| Milestone | Status |
|---|---|
| 1.1 Project initialisation | Done |
| 1.2 Google Cloud configuration | Done (user configured `.env`) |
| 1.3 OAuth authentication | Backend done; needs a live login test and the frontend connect screen (1.7) |
| 1.4 Database setup (models, Alembic) | Done |
| 1.5 Google Drive client | Not started |
| 1.6 File scanner | Not started |
| 1.7 Frontend integration | Not started |

### Phase 1 checklist

- [x] React application initialised
- [x] FastAPI application initialised
- [x] PostgreSQL configured
- [x] Google Cloud project created
- [x] Google Drive API enabled
- [x] OAuth credentials generated
- [x] Google OAuth flow implemented (backend, live login not yet tested)
- [x] Secure token persistence implemented (Fernet-encrypted at rest)
- [ ] Google Drive client implemented
- [ ] File metadata retrieval implemented
- [ ] Pagination implemented
- [ ] File metadata stored in PostgreSQL
- [ ] Folder relationships stored
- [ ] Scan progress implemented
- [ ] Scan checkpointing implemented
- [ ] Scan resumption implemented
- [ ] File inventory displayed in React

## Progress Log

Newest first.

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
