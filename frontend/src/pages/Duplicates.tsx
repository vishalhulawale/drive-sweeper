import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import MenuItem from '@mui/material/MenuItem'
import Pagination from '@mui/material/Pagination'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import {
  useDetectDuplicates, useDuplicateGroups, useDuplicateSummary, useSelectAction,
} from '../hooks/useDuplicates'
import { errorMessage } from '../services/api'
import type { DuplicateAction, DuplicateEntry, DuplicateGroup, DuplicateSort } from '../types/duplicate'
import { formatBytes, formatDate } from '../utils/format'

const PAGE_SIZE = 20

function EntryRow({ entry }: { entry: DuplicateEntry }) {
  const select = useSelectAction()
  // The user's choice wins; otherwise show the recommendation.
  const effective = entry.user_selected_action ?? entry.recommended_action
  const chosen = entry.user_selected_action !== null
  const f = entry.file
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: "center", py: 0.75 }}>
      <Stack sx={{ flex: 1, minWidth: 0 }}>
        <Link href={f.web_view_link ?? undefined} target="_blank" rel="noreferrer" underline="hover" noWrap>
          {f.name}
        </Link>
        <Typography variant="caption" color="text.secondary">
          Created {formatDate(f.created_time)} · Modified {formatDate(f.modified_time)}
        </Typography>
      </Stack>
      {!chosen && entry.recommended_action && (
        <Chip size="small" variant="outlined" label={`Suggested: ${entry.recommended_action}`} />
      )}
      <ToggleButtonGroup
        size="small"
        exclusive
        value={effective}
        onChange={(_, v: DuplicateAction | null) =>
          select.mutate({ entryId: entry.entry_id, action: v })
        }
      >
        <ToggleButton value="keep" color="success">Keep</ToggleButton>
        <ToggleButton value="trash" color="warning">Trash</ToggleButton>
      </ToggleButtonGroup>
    </Stack>
  )
}

function GroupCard({ group }: { group: DuplicateGroup }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
          <Typography variant="subtitle1" sx={{ flex: 1 }}>
            {group.file_count} copies · {formatBytes(group.file_size)} each
          </Typography>
          <Chip color="primary" size="small" label={`Save ${formatBytes(group.potential_savings)}`} />
        </Stack>
        {group.files.map((e) => (
          <EntryRow key={e.entry_id} entry={e} />
        ))}
      </CardContent>
    </Card>
  )
}

export default function Duplicates() {
  const [sort, setSort] = useState<DuplicateSort>('savings')
  const [page, setPage] = useState(1)
  const summary = useDuplicateSummary()
  const groups = useDuplicateGroups(sort, page, PAGE_SIZE)
  const detect = useDetectDuplicates()
  const pages = Math.max(1, Math.ceil((groups.data?.total ?? 0) / PAGE_SIZE))

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
        <Typography variant="h4" sx={{ flex: 1 }}>Duplicates</Typography>
        <TextField
          select size="small" label="Sort by" value={sort}
          onChange={(e) => { setSort(e.target.value as DuplicateSort); setPage(1) }}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="savings">Most savings</MenuItem>
          <MenuItem value="count">Most copies</MenuItem>
          <MenuItem value="size">Largest file</MenuItem>
        </TextField>
        <Button variant="contained" onClick={() => detect.mutate()} disabled={detect.isPending}>
          {detect.isPending ? 'Detecting…' : 'Find duplicates'}
        </Button>
      </Stack>

      <Alert severity="info">
        Exact matches only (same MD5 and size). Trashed, shared-with-me, empty and Google-native files are
        excluded. This page only records your choices; nothing is changed in Drive.
      </Alert>
      {(detect.isError || groups.isError) && (
        <Alert severity="error">{errorMessage(detect.error ?? groups.error)}</Alert>
      )}

      {summary.data && (
        <Typography color="text.secondary">
          {summary.data.groups.toLocaleString()} groups · {summary.data.duplicate_files.toLocaleString()} files ·
          up to {formatBytes(summary.data.potential_savings)} reclaimable
        </Typography>
      )}

      {!groups.isLoading && groups.data?.total === 0 && (
        <Alert severity="success">No duplicates found. Run “Find duplicates” after a scan.</Alert>
      )}
      {groups.data?.items.map((g) => <GroupCard key={g.id} group={g} />)}
      {pages > 1 && (
        <Pagination count={pages} page={page} onChange={(_, p) => setPage(p)} sx={{ alignSelf: 'center' }} />
      )}
    </Stack>
  )
}
