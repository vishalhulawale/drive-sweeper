import type { DriveFileItem } from './file'

export type SuggestMethod = 'content' | 'pattern'

export interface Suggestion {
  file: DriveFileItem
  /** null: a new folder called folder_name is created at the top of My Drive when the move runs. */
  folder_id: string | null
  folder_name: string
  new_folder: boolean
  score: number
  confidence: 'high' | 'medium'
  reasons: string[]
  /** Content suggestions: what Claude says the file is. */
  summary: string | null
}

export interface SuggestionPage {
  items: Suggestion[]
  source: string
  method: SuggestMethod
}

export interface Move {
  file_id: string
  folder_id?: string
  folder_name?: string
}

export interface ContentStatus {
  configured: boolean
  running: boolean
  last_error: string | null
  last_result: { classified: number; unclassified: number; total: number; cancelled: boolean } | null
  candidates: number
  analyzed: number
  pending: number
  progress_done: number
  progress_total: number
}
