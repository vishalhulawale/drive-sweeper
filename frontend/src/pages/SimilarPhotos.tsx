import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
import Pagination from '@mui/material/Pagination'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useApplySuggestions, useDuplicateGroups, useSelectAction } from '../hooks/useDuplicates'
import { useCancelNear, useNearStatus, useRegroupNear, useStartNear } from '../hooks/useNear'
import { errorMessage } from '../services/api'
import { nearService } from '../services/nearService'
import type { DuplicateAction, DuplicateEntry, DuplicateGroup } from '../types/duplicate'
import { formatBytes, formatDate } from '../utils/format'

const PAGE_SIZE = 10

function Photo({ entry }: { entry: DuplicateEntry }) {
  const select = useSelectAction()
  const f = entry.file
  const effective = entry.user_selected_action ?? entry.recommended_action
  const chosen = entry.user_selected_action !== null
  return (
    <Stack spacing={1} sx={{ width: 210 }}>
      <Link href={f.web_view_link ?? undefined} target="_blank" rel="noreferrer">
        <Box
          component="img" loading="lazy" alt={f.name} src={nearService.thumbnailUrl(f.google_file_id)}
          sx={{ width: 210, height: 160, objectFit: 'contain', bgcolor: 'action.hover', borderRadius: 1, display: 'block' }}
        />
      </Link>
      <Typography variant="body2" noWrap title={f.name}>{f.name}</Typography>
      <Typography variant="caption" color="text.secondary">
        {formatBytes(f.size)} · {formatDate(f.modified_time)}
      </Typography>
      {!chosen && entry.recommended_action === 'keep' && <Chip size="small" variant="outlined" label="Suggested: best copy" />}
      <ToggleButtonGroup
        size="small" exclusive value={effective}
        onChange={(_, v: DuplicateAction | null) =>
          select.mutate({ entryId: entry.entry_id, action: v ?? (chosen ? null : effective) })
        }
      >
        <ToggleButton value="keep" color="success">Keep</ToggleButton>
        <ToggleButton value="trash" color="warning">Trash</ToggleButton>
      </ToggleButtonGroup>
    </Stack>
  )
}

function Group({ group }: { group: DuplicateGroup }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
          <Typography variant="subtitle1" sx={{ flex: 1 }}>{group.file_count} similar photos</Typography>
          <Chip color="primary" size="small" label={`Save up to ${formatBytes(group.potential_savings)}`} />
        </Stack>
        <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', rowGap: 3 }}>
          {group.files.map((e) => <Photo key={e.entry_id} entry={e} />)}
        </Stack>
      </CardContent>
    </Card>
  )
}

export default function SimilarPhotos() {
  const [page, setPage] = useState(1)
  const status = useNearStatus()
  const start = useStartNear()
  const cancel = useCancelNear()
  const regroup = useRegroupNear()
  const groups = useDuplicateGroups('savings', page, PAGE_SIZE, 'near')
  const apply = useApplySuggestions('near')
  const s = status.data
  const running = s?.running ?? false
  const done = s ? s.eligible - s.pending : 0
  const pages = Math.max(1, Math.ceil((groups.data?.total ?? 0) / PAGE_SIZE))
  const err = status.error ?? start.error ?? cancel.error ?? groups.error ?? regroup.error

  return (
    <Stack spacing={2}>
      <Typography variant="h4">Similar photos</Typography>
      <Typography color="text.secondary">
        Finds photos that look the same but are not identical files: resized, re-saved or lightly edited copies.
        Each match is a suggestion for you to look at. The largest copy is suggested to keep.
      </Typography>
      {err != null && <Alert severity="error">{errorMessage(err)}</Alert>}
      {s?.last_error && <Alert severity="warning">Last analysis stopped: {s.last_error}</Alert>}

      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Stack sx={{ flex: 1, minWidth: 260 }}>
              <Typography variant="h6">Analysis</Typography>
              <Typography variant="body2" color="text.secondary">
                {s
                  ? `${done.toLocaleString()} of ${s.eligible.toLocaleString()} photos analysed` +
                    (s.unhashable ? ` (${s.unhashable.toLocaleString()} could not be read)` : '')
                  : '…'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Reads a tiny 64-pixel preview of each photo from Google, never the original file. The first run on a
                large Drive can take several minutes; it can be stopped and resumed, and later runs only look at new
                or changed photos. Photos under 30 KB are skipped.
              </Typography>
            </Stack>
            {running ? (
              <Button color="warning" onClick={() => cancel.mutate()} disabled={cancel.isPending}>Stop</Button>
            ) : (
              <>
                <Button onClick={() => regroup.mutate()} disabled={regroup.isPending || !s?.hashed}>Re-group</Button>
                <Button variant="contained" onClick={() => start.mutate()} disabled={start.isPending || !s || s.eligible === 0}>
                  {s && s.pending === 0 && s.eligible > 0 ? 'Check for new photos' : done > 0 ? 'Resume analysis' : 'Analyse photos'}
                </Button>
              </>
            )}
          </Stack>
          {running && s && (
            <LinearProgress variant="determinate" sx={{ mt: 2 }}
              value={s.eligible ? (done / s.eligible) * 100 : 0} />
          )}
        </CardContent>
      </Card>

      {s && s.groups > 0 && (
        <Alert
          severity="info"
          action={
            <Stack direction="row" spacing={1}>
              <Button size="small" disabled={apply.isPending || !groups.data?.items.length}
                onClick={() => apply.mutate(groups.data?.items.map((g) => g.id) ?? [])}>
                Trash all but the best (this page)
              </Button>
              <Button size="small" component={RouterLink} to="/cleanup">Go to Cleanup</Button>
            </Stack>
          }
        >
          {s.groups.toLocaleString()} groups, {s.similar_files.toLocaleString()} photos, up to {formatBytes(s.potential_savings)}{' '}
          could be freed. Look at the previews before you trash anything: similar is not always the same.
        </Alert>
      )}
      {s && s.groups === 0 && s.pending === 0 && s.eligible > 0 && (
        <Alert severity="success">No similar photos found.</Alert>
      )}
      {groups.data?.items.map((g) => <Group key={g.id} group={g} />)}
      {pages > 1 && <Pagination count={pages} page={page} onChange={(_, p) => setPage(p)} sx={{ alignSelf: 'center' }} />}
    </Stack>
  )
}
