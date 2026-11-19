from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.files import FileOut


class PlanItem(BaseModel):
    group_id: int
    file: FileOut
    keeper_name: str


class BlockedGroup(BaseModel):
    group_id: int
    reason: str


class CleanupPlan(BaseModel):
    count: int
    bytes: int
    max_batch: int
    items: list[PlanItem]
    blocked: list[BlockedGroup]


class ExecuteIn(BaseModel):
    expected_count: int = Field(ge=1)


class OperationOut(BaseModel):
    id: int
    operation_type: str
    status: str
    file_name: str
    file_size: int | None
    web_view_link: str | None
    created_at: datetime
    completed_at: datetime | None
    error_message: str | None


class CleanupStatus(BaseModel):
    running: bool
    total: int
    remaining: int
