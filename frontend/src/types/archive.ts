import type { DriveFileItem } from './file'

export type ExtractionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
export type ExtractionStage = 'queued' | 'checking' | 'downloading' | 'uploading' | 'trashing' | 'done'

export interface Extraction {
  id: number
  google_file_id: string
  archive_name: string
  archive_size: number | null
  web_view_link: string | null
  folder_name: string
  folder_google_id: string | null
  status: ExtractionStatus
  stage: ExtractionStage
  files_total: number
  files_done: number
  files_skipped: number
  entries_ignored: number
  bytes_total: number
  bytes_done: number
  archive_trashed: boolean
  error_message: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export interface ArchiveItem {
  file_id: number
  file: DriveFileItem
  kind: 'zip' | 'rar' | 'tar'
  folder_name: string
  parent_name: string
  last: Extraction | null
}

export interface ArchiveList {
  items: ArchiveItem[]
  rar_supported: boolean
  workers: number
}

export interface ArchiveStatus {
  running: boolean
  extractions: Extraction[]
}

export const folderUrl = (id: string) => `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`
