export type ScanStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted'

export interface Scan {
  id: number
  status: ScanStatus
  total_files: number | null
  processed_files: number
  started_at: string
  completed_at: string | null
  error_message: string | null
}

export const isActive = (s: Scan) => s.status === 'pending' || s.status === 'running'
export const isResumable = (s: Scan) =>
  s.status === 'failed' || s.status === 'cancelled' || s.status === 'interrupted'
