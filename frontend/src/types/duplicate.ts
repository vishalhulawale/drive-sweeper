import type { DriveFileItem } from './file'

export type DuplicateAction = 'keep' | 'trash'

export interface DuplicateSummary {
  groups: number
  duplicate_files: number
  potential_savings: number
}

export interface DuplicateEntry {
  entry_id: number
  file: DriveFileItem
  recommended_action: DuplicateAction | null
  user_selected_action: DuplicateAction | null
}

export interface DuplicateGroup {
  id: number
  detection_type: 'exact' | 'near'
  content_hash: string
  file_count: number
  file_size: number
  potential_savings: number
  files: DuplicateEntry[]
}

export interface DuplicatePage {
  items: DuplicateGroup[]
  total: number
  page: number
  page_size: number
}

export type DuplicateSort = 'savings' | 'count' | 'size'
