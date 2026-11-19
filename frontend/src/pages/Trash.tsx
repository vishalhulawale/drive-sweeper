import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TablePagination from '@mui/material/TablePagination'
import TableRow from '@mui/material/TableRow'
import TableSortLabel from '@mui/material/TableSortLabel'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import StatCard from '../components/dashboard/StatCard'
import { useRefreshTrashDates, useTrashItems, useTrashOverview } from '../hooks/useTrash'
import { errorMessage } from '../services/api'
import type { TrashSort } from '../types/trash'
import { formatBytes, formatDate } from '../utils/format'

const PAGE_SIZE = 50

function daysLeft(iso: string | null): number | null {
  if (!iso) return null
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

export default function Trash() {
  const [sort, setSort] = useState<TrashSort>('size')
  const [page, setPage] = useState(0)
  const overview = useTrashOverview()
  const items = useTrashItems(sort, page + 1, PAGE_SIZE)
  const refresh = useRefreshTrashDates()
  const o = overview.data
  const err = overview.error ?? items.error ?? refresh.error

  const sortCell = (key: TrashSort, label: string, align?: 'right') => (
    <TableCell align={align} sortDirection={sort === key ? 'asc' : false}>
      <TableSortLabel active={sort === key} direction="asc" onClick={() => { setSort(key); setPage(0) }}>
        {label}
      </TableSortLabel>
    </TableCell>
  )

  return (
    <Stack spacing={2}>
      <Typography variant="h4">Trash</Typography>
      <Typography color="text.secondary">
        Files you own that are in Google Drive&apos;s Trash. They still count against your storage until Drive
        deletes them, which it does automatically {o?.auto_delete_days ?? 30} days after they were trashed.
      </Typography>
      {err != null && <Alert severity="error">{errorMessage(err)}</Alert>}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
        <StatCard label="Taking up space" value={o ? formatBytes(o.bytes) : '…'}
          hint={o ? `${o.files.toLocaleString()} files` : undefined} />
        <StatCard label="Deleted automatically within 7 days" value={o ? formatBytes(o.deleting_soon_bytes) : '…'}
          hint={o ? `${o.deleting_soon_files.toLocaleString()} files` : undefined} />
        <StatCard label="Next automatic deletion"
          value={o?.next_auto_delete_at ? formatDate(o.next_auto_delete_at) : o ? 'Unknown' : '…'}
          hint={o && o.undated_files > 0 ? `${o.undated_files.toLocaleString()} files have no date yet` : undefined} />
      </Box>

      <Alert
        severity="info"
        action={
          <Button color="inherit" size="small" href={o?.drive_trash_url ?? 'https://drive.google.com/drive/trash'}
            target="_blank" rel="noreferrer" endIcon={<OpenInNewIcon />}>
            Open Drive Trash
          </Button>
        }
      >
        To free this space sooner, empty the Trash in Drive. That is permanent, so DriveClean does not do it for you.
        If you trashed something here by mistake, restore it from the{' '}
        <Link component={RouterLink} to="/cleanup">Cleanup history</Link> or in Drive before it is deleted.
      </Alert>

      {o && o.undated_files > 0 && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
              {refresh.isPending ? 'Fetching…' : 'Fetch dates'}
            </Button>
          }
        >
          {o.undated_files.toLocaleString()} files do not have a trashed date yet, so their deletion date is unknown.
          Fetching the dates only reads information from Drive.
        </Alert>
      )}
      {refresh.data && (
        <Alert severity="success">
          Checked {refresh.data.seen.toLocaleString()} items; updated {refresh.data.updated.toLocaleString()} dates.
        </Alert>
      )}

      <TableContainer component={Paper} variant="outlined" sx={{ opacity: items.isPlaceholderData ? 0.6 : 1 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              {sortCell('name', 'Name')}
              <TableCell>Trashed</TableCell>
              {sortCell('deletes', 'Deleted by Drive')}
              {sortCell('size', 'Size', 'right')}
            </TableRow>
          </TableHead>
          <TableBody>
            {items.data?.items.map((i) => {
              const left = daysLeft(i.auto_deletes_at)
              return (
                <TableRow key={i.file.google_file_id} hover>
                  <TableCell sx={{ maxWidth: 420 }}>
                    <Link href={i.file.web_view_link ?? undefined} target="_blank" rel="noreferrer" underline="hover" noWrap>
                      {i.file.name}
                    </Link>
                    {i.trashed_by_app && <Chip size="small" label="trashed here" sx={{ ml: 1 }} />}
                  </TableCell>
                  <TableCell>{i.trashed_at ? formatDate(i.trashed_at) : '—'}</TableCell>
                  <TableCell>
                    {i.auto_deletes_at ? (
                      <>
                        {formatDate(i.auto_deletes_at)}
                        <Typography variant="caption" color={left !== null && left <= 7 ? 'warning.main' : 'text.secondary'} component="div">
                          {left !== null && left <= 0 ? 'due now' : `${left} day${left === 1 ? '' : 's'} left`}
                        </Typography>
                      </>
                    ) : '—'}
                  </TableCell>
                  <TableCell align="right">{formatBytes(i.file.size)}</TableCell>
                </TableRow>
              )
            })}
            {items.data?.items.length === 0 && (
              <TableRow><TableCell colSpan={4}>Your Trash is empty.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination component="div" count={items.data?.total ?? 0} page={page} rowsPerPage={PAGE_SIZE}
          rowsPerPageOptions={[PAGE_SIZE]} onPageChange={(_, p) => setPage(p)} />
      </TableContainer>
    </Stack>
  )
}
