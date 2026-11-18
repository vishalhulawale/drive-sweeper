from datetime import datetime

from pydantic import BaseModel, ConfigDict


class FileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    google_file_id: str
    name: str
    mime_type: str
    size: int | None
    md5_checksum: str | None
    parent_folder_id: str | None
    created_time: datetime | None
    modified_time: datetime | None
    web_view_link: str | None
    trashed: bool
    is_owned_by_user: bool
    is_shortcut: bool
    is_folder: bool = False


class FilePage(BaseModel):
    items: list[FileOut]
    total: int
    page: int
    page_size: int


class TreeNode(BaseModel):
    google_file_id: str
    name: str
    child_folder_count: int


class InventorySummary(BaseModel):
    total_items: int
    files: int
    folders: int
    google_docs: int
    shortcuts: int
    trashed: int
    shared_with_me: int
    total_size: int
    last_scan_completed_at: datetime | None
