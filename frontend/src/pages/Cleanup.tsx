import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import LinearProgress from '@mui/material/LinearProgress'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import {
  useCancelCleanup, useCleanupPlan, useCleanupStatus, useExecuteCleanup, useOperations, useRestore,
} from '../hooks/useCleanup'
import { useAuthStatus } from '../hooks/useGoogleDrive'
import { authService } from '../services/authService'
import { errorMessage } from '../services/api'
import { formatBytes, formatDate } from '../utils/format'

const PREVIEW_ROWS = 100

const STATUS_COLOR: Record<string, 'success' | 'error' | 'warning' | 'default' | 'info'> = {
  completed: 'success', failed: 'error', skipped: 'warning', restored: 'info', pending: 'default', cancelled: 'default',
}

export default function Cleanup() {
  const auth = useAuthStatus()
  const plan = useCleanupPlan()
  const status = useCleanupStatus()
  const running = status.data?.running ?? false
  const ops = useOperations(running)
  const cancel = useCancelCleanup()
  const execute = useExecuteCleanup()
  const restore = useRestore()
  const [confirming, setConfirming] = useState(false)

  // Polling stops the moment the run ends, so the last poll can still show files as pending.
  // Refresh everything once when a run finishes.
  const qc = useQueryClient()
  const wasRunning = useRef(false)
  useEffect(() => {
    if (wasRunning.current && !running) {
      for (const key of ['cleanup-ops', 'cleanup-plan', 'dup-groups', 'dup-summary', 'files', 'summary']) {
        qc.invalidateQueries({ queryKey: [key] })
      }
    }
    wasRunning.current = running
  }, [running, qc])

  const canTrash = auth.data?.can_trash ?? false
  const count = plan.data?.count ?? 0
  const tooMany = plan.data ? count > plan.data.max_batch : false

  return (
    <Stack spacing={2}>
      <Typography variant="h4">Cleanup</Typography>

      {!canTrash && (
        <Alert
          severity="warning"
          action={<Button href={authService.upgradeUrl}>Allow cleanup</Button>}
        >
          Moving files to Trash needs a broader Google permission than scanning. Nothing is deleted
          permanently: files go to Drive&apos;s Trash and can be restored here or in Drive.
        </Alert>
      )}
      {(plan.isError || execute.isError || restore.isError) && (
        <Alert severity="error">{errorMessage(plan.error ?? execute.error ?? restore.error)}</Alert>
      )}

      {running && status.data && (
        <Alert
          severity="info"
          action={<Button color="inherit" size="small" disabled={cancel.isPending} onClick={() => cancel.mutate()}>Cancel remaining</Button>}
        >
          Moving files to Trash: {status.data.total - status.data.remaining} of {status.data.total} done.
          You can leave this page; it keeps running while the server is up.
          <LinearProgress
            variant="determinate" sx={{ mt: 1 }}
            value={status.data.total ? ((status.data.total - status.data.remaining) / status.data.total) * 100 : 0}
          />
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <Stack sx={{ flex: 1 }}>
            <Typography variant="h6">Ready to move to Trash</Typography>
            <Typography color="text.secondary">
              {count === 0
                ? 'Nothing selected. Mark files as Trash on the Duplicates page first.'
                : `${count} file${count === 1 ? '' : 's'} · ${formatBytes(plan.data?.bytes)}`}
            </Typography>
          </Stack>
          <Button
            variant="contained" color="warning"
            disabled={!canTrash || count === 0 || tooMany || execute.isPending || running}
            onClick={() => setConfirming(true)}
          >
            Move to Trash…
          </Button>
        </Stack>
        {tooMany && (
          <Alert severity="info" sx={{ mt: 2 }}>
            At most {plan.data?.max_batch} files per run. Unmark some and run again.
          </Alert>
        )}
        {plan.data?.blocked.map((b) => (
          <Alert key={b.group_id} severity="warning" sx={{ mt: 1 }}>
            Group {b.group_id}: {b.reason}
          </Alert>
        ))}
        {plan.data && plan.data.items.length > 0 && (
          <TableContainer sx={{ mt: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>File to trash</TableCell>
                  <TableCell>Copy you keep</TableCell>
                  <TableCell align="right">Size</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {plan.data.items.slice(0, PREVIEW_ROWS).map((i) => (
                  <TableRow key={i.file.google_file_id}>
                    <TableCell>{i.file.name}</TableCell>
                    <TableCell>{i.keeper_name}</TableCell>
                    <TableCell align="right">{formatBytes(i.file.size)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {plan.data.items.length > PREVIEW_ROWS && (
              <Typography variant="caption" color="text.secondary" sx={{ p: 1, display: 'block' }}>
                Showing the first {PREVIEW_ROWS} of {plan.data.items.length.toLocaleString()} files.
              </Typography>
            )}
          </TableContainer>
        )}
      </Paper>

      <Typography variant="h6">History</Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>When</TableCell>
              <TableCell>Action</TableCell>
              <TableCell>File</TableCell>
              <TableCell align="right">Size</TableCell>
              <TableCell>Status</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {ops.data?.map((o) => (
              <TableRow key={o.id}>
                <TableCell>{formatDate(o.completed_at ?? o.created_at)}</TableCell>
                <TableCell>{o.operation_type}</TableCell>
                <TableCell title={o.error_message ?? undefined}>
                  {o.file_name}
                  {o.error_message && (
                    <Typography variant="caption" color="text.secondary" component="div">
                      {o.error_message}
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right">{formatBytes(o.file_size)}</TableCell>
                <TableCell><Chip size="small" label={o.status} color={STATUS_COLOR[o.status] ?? 'default'} /></TableCell>
                <TableCell align="right">
                  {o.operation_type === 'trash' && o.status === 'completed' && (
                    <Button size="small" disabled={!canTrash || restore.isPending} onClick={() => restore.mutate(o.id)}>
                      Restore
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {ops.data?.length === 0 && (
              <TableRow><TableCell colSpan={6}>No cleanup actions yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={confirming} onClose={() => setConfirming(false)}>
        <DialogTitle>Move {count.toLocaleString()} file{count === 1 ? '' : 's'} to Trash?</DialogTitle>
        <DialogContent>
          <Typography>
            {formatBytes(plan.data?.bytes)} will move to your Google Drive Trash. The copy you keep in each
            group is checked against Drive first. Large selections run in the background and can take a while (roughly a second per file). You can cancel the remainder, and restore any file from the history below.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)}>Cancel</Button>
          <Button
            color="warning" variant="contained" disabled={execute.isPending}
            onClick={() => execute.mutate(count, { onSettled: () => setConfirming(false) })}
          >
            {execute.isPending ? 'Moving…' : 'Move to Trash'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
