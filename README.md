# DriveClean

Find and clean up duplicate files in your Google Drive.

DriveClean scans your Drive's metadata into a local PostgreSQL database, finds exact duplicates and visually similar photos, and lets you review them and move the copies you don't need to Drive's Trash. It never deletes anything permanently and never acts without your approval.

## Features

- **Exact duplicates**: files grouped by MD5 and size, verified with SHA-256. The oldest copy is suggested as the one to keep.
- **Similar photos**: resized, re-saved or format-converted copies (HEIC vs JPEG, for example) found from small Drive previews, using a perceptual hash with structure and colour checks. Original files are never downloaded.
- **Manual cleanup**: you mark files for Trash, and DriveClean re-checks every file live against Drive before moving it. At least one copy of each group is always kept, and every action is recorded and can be restored.
- **Storage analytics**: usage by file type and year, the largest files, and a folder treemap.
- **Trash overview**: how much space Trash uses and when Drive will delete each item.
- **File organizer**: suggests existing folders for loose files based on file types, dates and naming patterns. Moves can be undone.
- **Incremental sync**: after the first full scan, the Drive Changes API keeps the inventory current in seconds. It runs on a schedule and when you open the review pages.

## How it works

```
React frontend ──REST──> FastAPI backend ──> Google Drive API v3
                              │
                              └──> PostgreSQL (metadata, scan state, duplicate groups, history)
```

Google Drive stays the source of truth. The database stores metadata only, never file contents. Scans are resumable, and long jobs (scans, photo analysis, cleanup runs) run in background threads with progress and cancel.

**Safety rules**, enforced in the backend:

- Only files you explicitly marked are touched; suggestions are never acted on.
- Each file is re-checked (owned by you, not changed since the scan, still allowed to be trashed) right before it moves.
- Files go to Drive's Trash, where they can be restored for 30 days. There is no permanent delete.
- The app starts with read-only access. Trash and move permissions are requested only when you first use those features.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, TanStack Query |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2, Alembic |
| Database | PostgreSQL 16 |
| Integration | Google Drive API v3, Google OAuth 2.0 |

## Getting started

### Prerequisites

- Docker (for PostgreSQL, or to run the whole app)
- Python 3.12 and Node.js 20+ (for local development)
- A Google Cloud project with OAuth credentials (see below)

### Google Cloud setup

1. Create a project in the [Google Cloud console](https://console.cloud.google.com/) and enable the **Google Drive API**.
2. Configure the OAuth consent screen (External, status Testing) and add your Google account as a test user.
3. Add the scopes `drive.metadata.readonly` and `drive`. The broader `drive` scope is requested only when you enable cleanup.
4. Create an OAuth client of type **Web application** with:
   - Authorized JavaScript origin: `http://localhost:5173`
   - Authorized redirect URI: `http://localhost:8000/api/auth/google/callback`

In Testing mode, Google shows an "unverified app" warning at sign-in, and refresh tokens expire after 7 days.

### Configuration

```bash
cp backend/.env.example backend/.env
```

Fill in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and generate a key for encrypting stored tokens:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Put the output in `TOKEN_ENCRYPTION_KEY`. Never commit `backend/.env`.

### Run with Docker

```bash
docker compose up -d --build
```

This starts PostgreSQL, the backend on port 8000 (migrations run on start) and the frontend on port 5173. Open http://localhost:5173, connect your Google account and run a full scan.

### Run locally

```bash
# Database
docker compose up -d db

# Backend
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# Frontend (in a second terminal)
cd frontend
npm install
npm run dev
```

The API is at http://localhost:8000 (interactive docs at `/docs`, health check at `/api/health`), and the app is at http://localhost:5173.

## Development

```bash
# Backend tests (needs the database running)
cd backend && pytest

# Frontend typecheck, lint and build
cd frontend && npm run lint && npm run build
```

Every schema change needs an Alembic migration: `alembic revision -m "describe the change"`.

### Project structure

```
backend/
  app/
    api/            FastAPI routes (thin; no business logic)
    services/       Drive client, scanner, sync, duplicate detection, cleanup, organizer
    workers/        Background jobs: scans, photo analysis, cleanup runs, auto-sync
    models/         SQLAlchemy models
    repositories/   Database queries
  migrations/       Alembic migrations
  tests/
frontend/
  src/
    pages/          One file per page
    components/     UI primitives (ui/), charts and shared components
    hooks/          TanStack Query hooks per API area
    services/       API clients
docker-compose.yml
```

## Limitations

- Built for a single user's own Drive. Shared drives are not scanned, and files shared with you are listed but never changed.
- Similar-photo detection depends on Drive's preview images. Colour variants that look identical in a preview cannot be told apart.
- Automatic sync runs only while the backend is running.

## License

[MIT](LICENSE)
