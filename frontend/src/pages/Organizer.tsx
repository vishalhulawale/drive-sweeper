import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { useAuthStatus } from '../hooks/useGoogleDrive'
import { useApplyMoves, useOrganizerHistory, useSuggestions, useUndoMove } from '../hooks/useOrganizer'
import { errorMessage } from '../services/api'
import { authService } from '../services/authService'
import { formatBytes, formatDate } from '../utils/format'

const MAX_MOVES = 200
const STATUS_COLOR: Record<string, 'success' | 'error' | 'warning' | 'default' | 'info'> = {
  completed: 'success', failed: 'error', skipped: 'warning', undone: 'info', pending: 'default',
}

export default function Organizer() {
  const [params] = useSearchParams()
  const source = params.get('source') ?? 'root'
  const auth = useAuthStatus()
  const canMove = auth.data?.can_trash ?? false // same full-Drive permission as cleanup
  const suggestions = useSuggestions(source)
  const history = useOrganizerHistory()
  const apply = useApplyMoves()
  const undo = useUndoMove()
  // Only the user's explicit ticks count; nothing is pre-selected.
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const items = suggestions.data?.items ?? []
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const high = items.filter((i) => i.confidence === 'high')
  const selected = items.filter((i) => picked.has(i.file.google_file_id))

  return (
    <Stack spacing={2}>
      <Typography variant="h4">Organizer</Typography>
      <Typography color="text.secondary">
        {source === 'root'
          ? 'Files sitting loose at the top level of your Drive, matched to the existing folder they most resemble.'
          : 'Files directly inside the chosen folder, matched to the existing folder they most resemble.'}{' '}
        Based on file type, dates and name patterns. Nothing moves until you tick files and confirm; every move
        can be undone.
      </Typography>
      {source !== 'root' && (
        <Alert severity="info" action={<Button component={RouterLink} to="/organizer" size="small">Back to top level</Button>}>
          Organizing a specific folder.
        </Alert>
      )}
      {!canMove && (
        <Alert severity="warning" action={<Button href={authService.upgradeUrl}>Allow cleanup</Button>}>
          Moving files needs the same broader Google permission as cleanup. You can still review suggestions.
        </Alert>
      )}
      {(suggestions.isError || apply.isError || undo.isError) && (
        <Alert severity="error">{errorMessage(suggestions.error ?? apply.error ?? undo.error)}</Alert>
      )}
      {apply.data && apply.data.some((o) => o.status !== 'completed') && (
        <Alert severity="warning">
          {apply.data.filter((o) => o.status === 'completed').length} moved; {apply.data.filter((o) => o.status !== 'completed').length}{' '}
          not moved (see history for the reason).
        </Alert>
      )}

      <Paper variant="outlined">
        <Stack direction="row" spacing={1} sx={{ p: 2, alignItems: 'center' }}>
          <Typography variant="h6" sx={{ flex: 1 }}>
            {suggestions.isLoading ? 'Looking…' : `${items.length} suggestion${items.length === 1 ? '' : 's'}`}
          </Typography>
          <Button size="small" disabled={!high.length}
            onClick={() => setPicked(new Set(high.map((i) => i.file.google_file_id)))}>
            Select high confidence ({high.length})
          </Button>
          <Button size="small" disabled={!picked.size} onClick={() => setPicked(new Set())}>Clear</Button>
          <Button
            variant="contained" disabled={!canMove || !selected.length || selected.length > MAX_MOVES || apply.isPending}
            onClick={() =>
              apply.mutate(selected.map((i) => ({ file_id: i.file.google_file_id, folder_id: i.folder_id })), {
                onSuccess: () => setPicked(new Set()),
              })
            }
          >
            {apply.isPending ? 'Moving…' : `Move ${selected.length || ''} file${selected.length === 1 ? '' : 's'}`}
          </Button>
        </Stack>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" />
                <TableCell>File</TableCell>
                <TableCell>Move to</TableCell>
                <TableCell>Confidence</TableCell>
                <TableCell align="right">Size</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((i) => (
                <TableRow key={i.file.google_file_id} hover>
                  <TableCell padding="checkbox">
                    <Checkbox checked={picked.has(i.file.google_file_id)} onChange={() => toggle(i.file.google_file_id)} />
                  </TableCell>
                  <TableCell sx={{ maxWidth: 360 }}>
                    <Link href={i.file.web_view_link ?? undefined} target="_blank" rel="noreferrer" underline="hover" noWrap>
                      {i.file.name}
                    </Link>
                    <Typography variant="caption" color="text.secondary" component="div">
                      Modified {formatDate(i.file.modified_time)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Link component={RouterLink} to={`/files?folder=${encodeURIComponent(i.folder_id)}`} underline="hover">
                      {i.folder_name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Tooltip title={<>{i.reasons.map((r) => <div key={r}>{r}</div>)}</>}>
                      <Chip size="small" color={i.confidence === 'high' ? 'success' : 'default'}
                        label={`${i.confidence} · ${Math.round(i.score * 100)}%`} />
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right">{formatBytes(i.file.size)}</TableCell>
                </TableRow>
              ))}
              {!suggestions.isLoading && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
                    No confident suggestions. Folders need at least 5 files to be used as a destination, and a
                    file must fit a folder&apos;s type and date range.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Typography variant="h6">Move history</Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>When</TableCell>
              <TableCell>Action</TableCell>
              <TableCell>File</TableCell>
              <TableCell>Status</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {history.data?.map((o) => (
              <TableRow key={o.id}>
                <TableCell>{formatDate(o.completed_at ?? o.created_at)}</TableCell>
                <TableCell>{o.operation_type === 'unmove' ? 'undo move' : 'move'}</TableCell>
                <TableCell>
                  {o.file_name}
                  {o.error_message && (
                    <Typography variant="caption" color="text.secondary" component="div">{o.error_message}</Typography>
                  )}
                </TableCell>
                <TableCell><Chip size="small" label={o.status} color={STATUS_COLOR[o.status] ?? 'default'} /></TableCell>
                <TableCell align="right">
                  {o.file_deleted && <Typography variant="caption" color="text.secondary">Deleted from Drive</Typography>}
                  {o.operation_type === 'move' && o.status === 'completed' && !o.file_deleted && (
                    <Button size="small" disabled={!canMove || undo.isPending} onClick={() => undo.mutate(o.id)}>Undo</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {history.data?.length === 0 && <TableRow><TableCell colSpan={5}>No moves yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  )
}
