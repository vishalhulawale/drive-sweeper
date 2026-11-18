export interface DriveFileItem {
  google_file_id: string
  name: string
  mime_type: string
  size: number | null
  md5_checksum: string | null
  parent_folder_id: string | null
  created_time: string | null
  modified_time: string | null
  web_view_link: string | null
  trashed: boolean
  is_owned_by_user: boolean
  is_shortcut: boolean
  is_folder: boolean
}

export interface FilePage {
  items: DriveFileItem[]
  total: number
  page: number
  page_size: number
}

export interface PathNode {
  google_file_id: string
  name: string
  child_folder_count: number
}

export interface InventorySummary {
  total_items: number
  files: number
  folders: number
  google_docs: number
  shortcuts: number
  trashed: number
  shared_with_me: number
  total_size: number
  last_scan_completed_at: string | null
}

export interface FileQuery {
  parent: string
  q: string
  trashed: boolean
  sort: 'name' | 'size' | 'modified' | 'created'
  order: 'asc' | 'desc'
  page: number
  pageSize: number
}
