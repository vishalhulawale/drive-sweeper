import type { DriveFileItem } from './file'

export interface CategoryUsage {
  category: string
  files: number
  bytes: number
}

export interface Overview {
  total_bytes: number
  total_files: number
  trashed_bytes: number
  trashed_files: number
  categories: CategoryUsage[]
}

export interface YearUsage {
  year: number
  files: number
  bytes: number
}

export interface FolderUsage {
  google_file_id: string
  name: string
  bytes: number
  files: number
}

export interface LargestFiles {
  items: DriveFileItem[]
}
