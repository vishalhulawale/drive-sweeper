import Alert from '@mui/material/Alert'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import ScanStatusChip from '../components/common/ScanStatusChip'
import { useScans } from '../hooks/useScan'
import { errorMessage } from '../services/api'
import { formatDate, formatDuration } from '../utils/format'

export default function ScanHistory() {
  const { data, isError, error, isLoading } = useScans()
  return (
    <Stack spacing={2}>
      <Typography variant="h4">Scan history</Typography>
      {isError && <Alert severity="error">{errorMessage(error)}</Alert>}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Files</TableCell>
              <TableCell>Started</TableCell>
              <TableCell>Duration</TableCell>
              <TableCell>Error</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data?.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.id}</TableCell>
                <TableCell>
                  <ScanStatusChip status={s.status} />
                </TableCell>
                <TableCell align="right">{s.processed_files.toLocaleString()}</TableCell>
                <TableCell>{formatDate(s.started_at)}</TableCell>
                <TableCell>{formatDuration(s.started_at, s.completed_at)}</TableCell>
                <TableCell sx={{ maxWidth: 360 }}>{s.error_message ?? ''}</TableCell>
              </TableRow>
            ))}
            {!isLoading && data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>No scans yet.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  )
}
