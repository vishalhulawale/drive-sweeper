import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router-dom'
import BarRow from '../components/common/BarRow'
import StatCard from '../components/dashboard/StatCard'
import { useByYear, useLargestFiles, useLargestFolders, useOverview } from '../hooks/useAnalytics'
import { useDuplicateSummary } from '../hooks/useDuplicates'
import { errorMessage } from '../services/api'
import { formatBytes, formatDate, friendlyType } from '../utils/format'

export default function Analytics() {
  const overview = useOverview()
  const years = useByYear()
  const files = useLargestFiles()
  const folders = useLargestFolders()
  const dups = useDuplicateSummary()
  const o = overview.data
  const err = overview.error ?? years.error ?? files.error ?? folders.error

  const maxCat = Math.max(0, ...(o?.categories.map((c) => c.bytes) ?? []))
  const maxYear = Math.max(0, ...(years.data?.map((y) => y.bytes) ?? []))
  const maxFolder = Math.max(0, ...(folders.data?.map((f) => f.bytes) ?? []))

  return (
    <Stack spacing={3}>
      <Typography variant="h4">Storage analytics</Typography>
      <Typography color="text.secondary">
        Based on your last scan. Counts files you own; shared-with-me files do not use your storage. Google
        Docs, Sheets and Slides take no space.
      </Typography>
      {err != null && <Alert severity="error">{errorMessage(err)}</Alert>}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
        <StatCard label="Storage used by files" value={o ? formatBytes(o.total_bytes) : '…'}
          hint={o ? `${o.total_files.toLocaleString()} files` : undefined} />
        <StatCard label="In Trash (still counts)" value={o ? formatBytes(o.trashed_bytes) : '…'}
          hint={o ? `${o.trashed_files.toLocaleString()} files; empty Trash in Drive to free it` : undefined} />
        <StatCard label="Reclaimable duplicates" value={dups.data ? formatBytes(dups.data.potential_savings) : '…'}
          hint={dups.data ? `${dups.data.groups.toLocaleString()} groups` : undefined} />
      </Box>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6">By type</Typography>
        {o?.categories.map((c) => (
          <BarRow key={c.category} label={c.category} bytes={c.bytes} max={maxCat}
            detail={`${c.files.toLocaleString()} files`} />
        ))}
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6">By year created</Typography>
        {years.data?.map((y) => (
          <BarRow key={y.year} label={String(y.year)} bytes={y.bytes} max={maxYear}
            detail={`${y.files.toLocaleString()} files`} />
        ))}
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6">Largest folders</Typography>
        <Typography variant="caption" color="text.secondary">Including everything inside them.</Typography>
        {folders.data?.map((f) => (
          <Stack key={f.google_file_id} direction="row" sx={{ alignItems: 'center' }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <BarRow label={f.name} bytes={f.bytes} max={maxFolder} detail={`${f.files.toLocaleString()} files`} />
            </Box>
            <Link component={RouterLink} to={`/files?folder=${encodeURIComponent(f.google_file_id)}`} sx={{ ml: 2 }}>
              Open
            </Link>
          </Stack>
        ))}
      </Paper>

      <Typography variant="h6">Largest files</Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Created</TableCell>
              <TableCell align="right">Size</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {files.data?.items.map((f) => (
              <TableRow key={f.google_file_id}>
                <TableCell sx={{ maxWidth: 420 }}>
                  <Link href={f.web_view_link ?? undefined} target="_blank" rel="noreferrer" underline="hover" noWrap>
                    {f.name}
                  </Link>
                </TableCell>
                <TableCell>{friendlyType(f.mime_type)}</TableCell>
                <TableCell>{formatDate(f.created_time)}</TableCell>
                <TableCell align="right">{formatBytes(f.size)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  )
}
