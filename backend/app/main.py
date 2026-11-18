import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from contextlib import asynccontextmanager

from app.api import auth, scans
from app.core.database import SessionLocal
from app.repositories import scan_repository
from app.core.config import settings

logging.basicConfig(level=logging.INFO)



@asynccontextmanager
async def lifespan(_app: FastAPI):
    with SessionLocal() as db:
        n = scan_repository.mark_running_as_interrupted(db)
        if n:
            logging.getLogger(__name__).warning("Marked %d orphaned scan(s) as interrupted", n)
    yield


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


@app.get("/api/health")
def health():
    return {"status": "ok"}
