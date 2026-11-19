import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import ScanPanel from '../components/dashboard/ScanPanel'
import SyncPanel from '../components/dashboard/SyncPanel'
import StatCard from '../components/dashboard/StatCard'
import { useInventorySummary } from '../hooks/useFiles'
import { useScans } from '../hooks/useScan'
import { errorMessage } from '../services/api'
import { isActive } from '../types/scan'
import { formatBytes, formatDate } from '../utils/format'

export default function Dashboard() {
  const scans = useScans()
  const scanning = scans.data?.some(isActive) ?? false
  const summary = useInventorySummary(scanning ? 4000 : false)
  const s = summary.data
  const n = (v: number | undefined) => (v === undefined ? '…' : v.toLocaleString())

  return (
    <Stack spacing={3}>
      <Typography variant="h4">Dashboard</Typography>
      <ScanPanel />
      <SyncPanel scanning={scanning} />
      {summary.isError && <Alert severity="error">{errorMessage(summary.error)}</Alert>}
      <Box
        sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}
      >
        <StatCard label="Total items" value={n(s?.total_items)} />
        <StatCard label="Files" value={n(s?.files)} />
        <StatCard label="Folders" value={n(s?.folders)} />
        <StatCard label="Google Docs / Sheets / Slides" value={n(s?.google_docs)} hint="No size or checksum" />
        <StatCard label="Reported size" value={s ? formatBytes(s.total_size) : '…'} hint="Excludes trash" />
        <StatCard label="In trash" value={n(s?.trashed)} />
        <StatCard label="Shared with you" value={n(s?.shared_with_me)} hint="Not owned by you" />
        <StatCard label="Last completed scan" value={s?.last_scan_completed_at ? formatDate(s.last_scan_completed_at) : 'Never'} />
      </Box>
    </Stack>
  )
}
