from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.files import FileOut


class ExtractionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    google_file_id: str
    archive_name: str
    archive_size: int | None
    web_view_link: str | None
    folder_name: str
    folder_google_id: str | None
    status: str
    stage: str
    files_total: int
    files_done: int
    files_skipped: int
    entries_ignored: int
    bytes_total: int
    bytes_done: int
    archive_trashed: bool
    error_message: str | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None


class ArchiveItem(BaseModel):
    file_id: int
    file: FileOut
    kind: str
    folder_name: str
    parent_name: str
    last: ExtractionOut | None


class ArchiveList(BaseModel):
    items: list[ArchiveItem]
    rar_supported: bool
    workers: int


class ExtractIn(BaseModel):
    file_ids: list[int] = Field(min_length=1)


class ArchiveStatus(BaseModel):
    running: bool
    extractions: list[ExtractionOut]
