from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ScanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: str
    total_files: int | None
    processed_files: int
    started_at: datetime
    completed_at: datetime | None
    error_message: str | None
