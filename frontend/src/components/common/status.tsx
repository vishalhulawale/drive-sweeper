import type { ScanStatus } from '../../types/scan'
import { Status, type StatusType } from '../ui/core'

const SCAN: Record<ScanStatus, [StatusType, string]> = {
  pending: ['pending', 'Starting'],
  running: ['in-progress', 'Scanning'],
  completed: ['success', 'Completed'],
  failed: ['error', 'Failed'],
  cancelled: ['stopped', 'Cancelled'],
  interrupted: ['warning', 'Interrupted'],
}

export function ScanStatusIndicator({ status }: { status: ScanStatus }) {
  const [type, text] = SCAN[status]
  return <Status type={type}>{text}</Status>
}

const OPERATION: Record<string, [StatusType, string]> = {
  completed: ['success', 'Done'],
  failed: ['error', 'Failed'],
  skipped: ['warning', 'Skipped'],
  restored: ['info', 'Restored'],
  undone: ['info', 'Undone'],
  pending: ['pending', 'Waiting'],
  running: ['in-progress', 'Running'],
  cancelled: ['stopped', 'Cancelled'],
}

/** Status of a cleanup or move operation, in words. */
export function OperationStatusIndicator({ status }: { status: string }) {
  const [type, text] = OPERATION[status] ?? ['info', status.charAt(0).toUpperCase() + status.slice(1)]
  return <Status type={type}>{text}</Status>
}
