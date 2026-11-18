import Chip from '@mui/material/Chip'
import type { ScanStatus } from '../../types/scan'

const COLORS: Record<ScanStatus, 'default' | 'info' | 'success' | 'error' | 'warning'> = {
  pending: 'info',
  running: 'info',
  completed: 'success',
  failed: 'error',
  cancelled: 'default',
  interrupted: 'warning',
}

export default function ScanStatusChip({ status }: { status: ScanStatus }) {
  return <Chip size="small" label={status} color={COLORS[status]} />
}
