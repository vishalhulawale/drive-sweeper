from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.cleanup import OperationOut
from app.schemas.files import FileOut

__all__ = ["OperationOut", "Suggestion", "SuggestionPage", "MoveIn", "ApplyIn"]


class Suggestion(BaseModel):
    file: FileOut
    folder_id: str
    folder_name: str
    score: float
    confidence: Literal["high", "medium"]
    reasons: list[str]


class SuggestionPage(BaseModel):
    items: list[Suggestion]
    source: str


class MoveIn(BaseModel):
    file_id: str = Field(min_length=1, max_length=128)
    folder_id: str = Field(min_length=1, max_length=128)


class ApplyIn(BaseModel):
    moves: list[MoveIn] = Field(min_length=1)
