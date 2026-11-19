import type { DriveFileItem } from './file'

export interface PlanItem {
  group_id: number
  file: DriveFileItem
  keeper_name: string
}

export interface CleanupPlan {
  count: number
  bytes: number
  max_batch: number
  items: PlanItem[]
  blocked: { group_id: number; reason: string }[]
}

export interface CleanupStatus {
  running: boolean
  total: number
  remaining: number
}

export interface Operation {
  id: number
  operation_type: 'trash' | 'restore' | 'move'
  status: string
  file_name: string
  file_size: number | null
  web_view_link: string | null
  created_at: string
  completed_at: string | null
  error_message: string | null
}
