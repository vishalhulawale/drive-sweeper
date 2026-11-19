import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from contextlib import asynccontextmanager

from app.api import analytics, auth, cleanup, duplicates, files, near_duplicates, organizer, scans, sync
from app.core.config import settings
from app.core.database import SessionLocal
from app.repositories import scan_repository
from app.services import cleanup_service
from app.workers import auto_sync

logging.basicConfig(level=logging.INFO)



@asynccontextmanager
async def lifespan(_app: FastAPI):
    with SessionLocal() as db:
        n = scan_repository.mark_running_as_interrupted(db)
        if n:
            logging.getLogger(__name__).warning("Marked %d orphaned scan(s) as interrupted", n)
        m = cleanup_service.mark_orphans_interrupted(db)
        if m:
            logging.getLogger(__name__).warning("Marked %d orphaned cleanup operation(s) as failed", m)
        auto_sync.reset_stuck(db)
    auto_sync.start()
    yield
    auto_sync.stop()


app = FastAPI(title="DriveClean", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth.router)
app.include_router(scans.router)
app.include_router(files.router)
app.include_router(duplicates.router)
app.include_router(cleanup.router)
app.include_router(analytics.router)
app.include_router(organizer.router)
app.include_router(sync.router)
app.include_router(near_duplicates.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
