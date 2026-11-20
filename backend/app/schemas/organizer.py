from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.cleanup import OperationOut
from app.schemas.files import FileOut

__all__ = ["OperationOut", "Suggestion", "SuggestionPage", "MoveIn", "ApplyIn", "ContentStatus"]


class Suggestion(BaseModel):
    file: FileOut
    folder_id: str | None  # None: a new folder called folder_name is created when the move is applied
    folder_name: str
    new_folder: bool = False
    score: float
    confidence: Literal["high", "medium"]
    reasons: list[str]
    summary: str | None = None  # content suggestions: what the model says the file is


class SuggestionPage(BaseModel):
    items: list[Suggestion]
    source: str
    method: Literal["pattern", "content"] = "pattern"


class MoveIn(BaseModel):
    file_id: str = Field(min_length=1, max_length=128)
    folder_id: str | None = Field(default=None, min_length=1, max_length=128)
    folder_name: str | None = Field(default=None, min_length=1, max_length=120)  # a new top-level folder

    @model_validator(mode="after")
    def _one_destination(self):
        if not self.folder_id and not self.folder_name:
            raise ValueError("Give folder_id, or folder_name for a new folder")
        return self


class ContentStatus(BaseModel):
    configured: bool  # the local model is pulled and answering, or a Claude credential is visible
    provider: str = "ollama"  # "ollama", "anthropic" or "foundry"
    running: bool
    last_error: str | None
    last_result: dict | None
    candidates: int
    analyzed: int
    pending: int
    progress_done: int
    progress_total: int


class ApplyIn(BaseModel):
    moves: list[MoveIn] = Field(min_length=1)
