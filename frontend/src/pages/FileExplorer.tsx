import FolderIcon from '@mui/icons-material/Folder'
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import Alert from '@mui/material/Alert'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TablePagination from '@mui/material/TablePagination'
import TableRow from '@mui/material/TableRow'
import TableSortLabel from '@mui/material/TableSortLabel'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useFiles, useFolderPath } from '../hooks/useFiles'
import { errorMessage } from '../services/api'
import type { FileQuery } from '../types/file'
import { formatBytes, formatDate, friendlyType } from '../utils/format'

const PAGE_SIZE = 50
type SortKey = FileQuery['sort']

export default function FileExplorer() {
  const [params, setParams] = useSearchParams()
  const folder = params.get('folder') ?? 'root'
  const q = params.get('q') ?? ''
  const trashed = params.get('trashed') === '1'
  const sort = (params.get('sort') as SortKey | null) ?? 'name'
  const order = params.get('order') === 'desc' ? 'desc' : 'asc'
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1)

  // Local text state so typing is instant; the URL (and query) updates after a short pause.
  const [text, setText] = useState(q)
  useEffect(() => setText(q), [q])
  useEffect(() => {
    if (text === q) return
    const t = setTimeout(() => update({ q: text || null, page: null }), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) next.delete(k)
      else next.set(k, v)
    }
    setParams(next)
  }

  const files = useFiles({ parent: folder, q, trashed, sort, order, page, pageSize: PAGE_SIZE })
  const path = useFolderPath(folder)

  const toggleSort = (key: SortKey) =>
    update({ sort: key, order: sort === key && order === 'asc' ? 'desc' : 'asc', page: null })

  const sortCell = (key: SortKey, label: string, align?: 'right') => (
    <TableCell align={align} sortDirection={sort === key ? order : false}>
      <TableSortLabel active={sort === key} direction={sort === key ? order : 'asc'} onClick={() => toggleSort(key)}>
        {label}
      </TableSortLabel>
    </TableCell>
  )

  return (
    <Stack spacing={2}>
      <Typography variant="h4">Files</Typography>

      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          size="small"
          label="Search all file names"
          value={text}
          onChange={(e) => setText(e.target.value)}
          sx={{ minWidth: 260 }}
        />
        <FormControlLabel
          control={<Switch checked={trashed} onChange={(e) => update({ trashed: e.target.checked ? '1' : null, page: null })} />}
          label="Show trashed"
        />
      </Stack>

      {q ? (
        <Typography variant="body2" color="text.secondary">
          Search results across your whole Drive.{' '}
          <Link component="button" onClick={() => update({ q: null })}>
            Clear search
          </Link>
        </Typography>
      ) : (
        <Breadcrumbs>
          <Link component="button" underline="hover" onClick={() => update({ folder: null, page: null })}>
            Top level
          </Link>
          {path.data?.map((p, i) =>
            i === path.data.length - 1 ? (
              <Typography key={p.google_file_id} color="text.primary">
                {p.name}
              </Typography>
            ) : (
              <Link
                key={p.google_file_id}
                component="button"
                underline="hover"
                onClick={() => update({ folder: p.google_file_id, page: null })}
              >
                {p.name}
              </Link>
            ),
          )}
        </Breadcrumbs>
      )}

      {files.isError && <Alert severity="error">{errorMessage(files.error)}</Alert>}

      <TableContainer component={Paper} variant="outlined" sx={{ opacity: files.isPlaceholderData ? 0.6 : 1 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              {sortCell('name', 'Name')}
              <TableCell>Type</TableCell>
              {sortCell('size', 'Size', 'right')}
              {sortCell('modified', 'Modified')}
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {files.data?.items.map((f) => (
              <TableRow key={f.google_file_id} hover>
                <TableCell sx={{ maxWidth: 520 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    {f.is_folder ? <FolderIcon color="primary" /> : <InsertDriveFileOutlinedIcon color="action" />}
                    {f.is_folder ? (
                      <Link component="button" underline="hover" onClick={() => update({ folder: f.google_file_id, q: null, page: null })}>
                        {f.name}
                      </Link>
                    ) : (
                      <Typography variant="body2" noWrap title={f.name}>
                        {f.name}
                      </Typography>
                    )}
                    {f.trashed && <Chip size="small" label="trashed" />}
                    {!f.is_owned_by_user && <Chip size="small" variant="outlined" label="shared" />}
                  </Stack>
                </TableCell>
                <TableCell>{friendlyType(f.mime_type)}</TableCell>
                <TableCell align="right">{f.is_folder ? '' : formatBytes(f.size)}</TableCell>
                <TableCell>{formatDate(f.modified_time)}</TableCell>
                <TableCell align="right">
                  {f.web_view_link && (
                    <IconButton size="small" component="a" href={f.web_view_link} target="_blank" rel="noopener noreferrer" aria-label="Open in Google Drive">
                      <OpenInNewIcon fontSize="small" />
                    </IconButton>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {files.data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>{q ? 'No files match your search.' : 'This folder is empty (or no scan has run yet).'}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={files.data?.total ?? 0}
          page={page - 1}
          rowsPerPage={PAGE_SIZE}
          rowsPerPageOptions={[PAGE_SIZE]}
          onPageChange={(_, p) => update({ page: p === 0 ? null : String(p + 1) })}
        />
      </TableContainer>
    </Stack>
  )
}
