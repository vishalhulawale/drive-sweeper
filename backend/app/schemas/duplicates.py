from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.files import FileOut


class DuplicateSummary(BaseModel):
    groups: int
    duplicate_files: int
    potential_savings: int


class DuplicateFileOut(BaseModel):
    entry_id: int
    file: FileOut
    recommended_action: str | None
    user_selected_action: str | None


class DuplicateGroupOut(BaseModel):
    id: int
    content_hash: str
    file_count: int
    file_size: int
    potential_savings: int
    files: list[DuplicateFileOut]


class DuplicateGroupPage(BaseModel):
    items: list[DuplicateGroupOut]
    total: int
    page: int
    page_size: int


class SelectionIn(BaseModel):
    action: Literal["keep", "trash"] | None


class ApplySuggestionsIn(BaseModel):
    group_ids: list[int] = Field(default_factory=list, max_length=100)
    all_groups: bool = False  # apply to every group instead of group_ids
