import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useCancelScan, useResumeScan, useScans, useStartScan } from '../../hooks/useScan'
import { errorMessage } from '../../services/api'
import { isActive, isResumable } from '../../types/scan'
import { formatDate, formatDuration } from '../../utils/format'
import ScanStatusChip from '../common/ScanStatusChip'

export default function ScanPanel() {
  const scans = useScans()
  const start = useStartScan()
  const resume = useResumeScan()
  const cancel = useCancelScan()

  const latest = scans.data?.[0]
  const active = latest && isActive(latest)
  const mutationError = start.error ?? resume.error ?? cancel.error

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Drive scan
          </Typography>
          {latest && <ScanStatusChip status={latest.status} />}
          {active ? (
            <Button color="warning" onClick={() => cancel.mutate(latest.id)} disabled={cancel.isPending}>
              Cancel
            </Button>
          ) : (
            <>
              {latest && isResumable(latest) && (
                <Button onClick={() => resume.mutate(latest.id)} disabled={resume.isPending}>
                  Resume
                </Button>
              )}
              <Button variant="contained" onClick={() => start.mutate()} disabled={start.isPending}>
                {latest ? 'New scan' : 'Start first scan'}
              </Button>
            </>
          )}
        </Stack>

        {scans.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {errorMessage(scans.error)}
          </Alert>
        )}
        {mutationError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {errorMessage(mutationError)}
          </Alert>
        )}

        {latest && (
          <Box sx={{ mt: 2 }}>
            {active && <LinearProgress sx={{ mb: 1 }} />}
            <Typography variant="body2">
              {latest.processed_files.toLocaleString()} files scanned
              {' · '}started {formatDate(latest.started_at)}
              {' · '}
              {formatDuration(latest.started_at, latest.completed_at)}
            </Typography>
            {latest.error_message && (
              <Alert severity={latest.status === 'failed' ? 'error' : 'warning'} sx={{ mt: 1 }}>
                {latest.error_message}
              </Alert>
            )}
          </Box>
        )}
        {!latest && !scans.isLoading && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            No scans yet. A scan reads file metadata only; nothing is downloaded or changed.
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}
