import type { DriveFileItem } from './file'

export interface TrashOverview {
  files: number
  bytes: number
  folders: number
  undated_files: number
  deleting_soon_files: number
  deleting_soon_bytes: number
  oldest_trashed_at: string | null
  next_auto_delete_at: string | null
  auto_delete_days: number
  drive_trash_url: string
}

export interface TrashItem {
  file: DriveFileItem
  trashed_at: string | null
  auto_deletes_at: string | null
  trashed_by_app: boolean
}

export interface TrashPage {
  items: TrashItem[]
  total: number
  page: number
  page_size: number
}

export type TrashSort = 'size' | 'deletes' | 'name'
