from pydantic import BaseModel

from app.schemas.files import FileOut


class CategoryUsage(BaseModel):
    category: str
    files: int
    bytes: int


class Overview(BaseModel):
    total_bytes: int
    total_files: int
    trashed_bytes: int
    trashed_files: int
    categories: list[CategoryUsage]


class YearUsage(BaseModel):
    year: int
    files: int
    bytes: int


class FolderUsage(BaseModel):
    google_file_id: str
    name: str
    bytes: int
    files: int


class LargestFiles(BaseModel):
    items: list[FileOut]
