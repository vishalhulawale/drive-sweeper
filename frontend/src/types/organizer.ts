import type { DriveFileItem } from './file'

export interface Suggestion {
  file: DriveFileItem
  folder_id: string
  folder_name: string
  score: number
  confidence: 'high' | 'medium'
  reasons: string[]
}

export interface SuggestionPage {
  items: Suggestion[]
  source: string
}

export interface Move {
  file_id: string
  folder_id: string
}
