import { File, Folder, SlidersHorizontal } from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import EmptyState from '../components/common/EmptyState'
import InfoLink from '../components/common/InfoLink'
import { Alert, Badge, Button, Checkbox, ExternalAnchor, PageHeader, Panel, SearchInput, Secondary, Select } from '../components/ui/core'
import { Modal } from '../components/ui/overlay'
import { Pagination, Table, Toolbar, type Column } from '../components/ui/table'
import { useFiles, useFolderPath } from '../hooks/useFiles'
import { errorMessage } from '../services/api'
import type { DriveFileItem, FileQuery } from '../types/file'
import { formatBytes, formatDate, friendlyType } from '../utils/format'

type SortKey = FileQuery['sort']
const PREFS_KEY = 'driveclean.files.prefs'

interface Prefs { pageSize: number; visibleContent: string[]; wrapLines: boolean }
const DEFAULT_PREFS: Prefs = { pageSize: 50, visibleContent: ['name', 'type', 'size', 'modified', 'owner'], wrapLines: false }

function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? 'null') as Partial<Prefs> | null
    return p ? { ...DEFAULT_PREFS, ...p } : DEFAULT_PREFS
  } catch {
    return DEFAULT_PREFS
  }
}

/** Page size, visible columns and line wrapping for the files table. */
function PreferencesModal({
  prefs, columns, onConfirm, onDismiss,
}: { prefs: Prefs; columns: Column<DriveFileItem>[]; onConfirm: (p: Prefs) => void; onDismiss: () => void }) {
  const [draft, setDraft] = useState(prefs)
  const toggleCol = (id: string, on: boolean) =>
    setDraft({ ...draft, visibleContent: on ? [...draft.visibleContent, id] : draft.visibleContent.filter((c) => c !== id) })
  return (
    <Modal
      visible
      onDismiss={onDismiss}
      header="Table preferences"
      footer={<><Button variant="link" className="mr-2" onClick={onDismiss}>Cancel</Button><Button variant="primary" onClick={() => onConfirm(draft)}>Confirm</Button></>}
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Files per page</span>
            <Select
              className="mt-1 block w-40"
              value={String(draft.pageSize)}
              options={[25, 50, 100].map((v) => ({ value: String(v), label: `${v} files` }))}
              onChange={(v) => setDraft({ ...draft, pageSize: Number(v) })}
            />
          </label>
          <Checkbox checked={draft.wrapLines} onChange={(wrapLines) => setDraft({ ...draft, wrapLines })} description="Show full file names on several lines">
            Wrap long names
          </Checkbox>
        </div>
        <fieldset>
          <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">Columns</legend>
          <div className="mt-2 flex flex-col gap-2">
            {columns.map((c) => (
              <Checkbox key={c.id} checked={draft.visibleContent.includes(c.id)} disabled={c.id === 'name'} onChange={(on) => toggleCol(c.id, on)}>
                {c.header}
              </Checkbox>
            ))}
          </div>
        </fieldset>
      </div>
    </Modal>
  )
}

export default function FileExplorer() {
  const [params, setParams] = useSearchParams()
  const folder = params.get('folder') ?? 'root'
  const q = params.get('q') ?? ''
  const trashed = params.get('trashed') === '1'
  const sort = (params.get('sort') as SortKey | null) ?? 'name'
  const order = params.get('order') === 'desc' ? 'desc' : 'asc'
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1)
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [editingPrefs, setEditingPrefs] = useState(false)

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) next.delete(k)
      else next.set(k, v)
    }
    setParams(next)
  }

  // Typing is instant; the URL (and the query) follows after a short pause.
  const [text, setText] = useState(q)
  const [lastQ, setLastQ] = useState(q)
  if (q !== lastQ) { setLastQ(q); setText(q) }
  useEffect(() => {
    if (text === q) return
    const t = setTimeout(() => update({ q: text || null, page: null }), 350)
    return () => clearTimeout(t)
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps

  const files = useFiles({ parent: folder, q, trashed, sort, order, page, pageSize: prefs.pageSize })
  const path = useFolderPath(folder)
  const total = files.data?.total ?? 0

  const openFolder = (id: string | null) => update({ folder: id, q: null, page: null })

  const columns: Column<DriveFileItem>[] = [
    {
      id: 'name', header: 'Name', sortField: 'name',
      cell: (f) => (
        <span className="inline-flex items-start gap-2">
          {f.is_folder
            ? <Folder size={15} className="mt-0.5 shrink-0 fill-brand-100 text-brand-600" aria-hidden />
            : <File size={15} className="mt-0.5 shrink-0 text-slate-400" aria-hidden />}
          {f.is_folder
            ? <button type="button" onClick={() => openFolder(f.google_file_id)} className="text-left font-medium text-brand-600 hover:underline dark:text-brand-500">{f.name}</button>
            : <ExternalAnchor href={f.web_view_link}>{f.name}</ExternalAnchor>}
          {f.trashed && <Badge color="amber">In Trash</Badge>}
        </span>
      ),
    },
    { id: 'type', header: 'Type', cell: (f) => friendlyType(f.mime_type) },
    { id: 'size', header: 'Size', sortField: 'size', align: 'right', cell: (f) => (f.is_folder ? '' : formatBytes(f.size)) },
    { id: 'modified', header: 'Modified', sortField: 'modified', cell: (f) => formatDate(f.modified_time) },
    { id: 'created', header: 'Created', sortField: 'created', cell: (f) => formatDate(f.created_time) },
    { id: 'owner', header: 'Owner', cell: (f) => (f.is_owned_by_user ? 'You' : <Secondary>Shared with you</Secondary>) },
  ]

  const crumbs = [{ id: null as string | null, name: 'My Drive' }, ...(path.data ?? []).map((p) => ({ id: p.google_file_id as string | null, name: p.name }))]

  return (
    <div>
      <PageHeader
        title="Files"
        info={<InfoLink />}
        description="Every file and folder found by the last scan. Search covers your whole Drive."
        actions={!q && folder !== 'root' ? <Button to={`/organizer?source=${encodeURIComponent(folder)}`}>Organize this folder</Button> : undefined}
      />
      <div className="flex flex-col gap-4">
        {files.isError && <Alert type="error">{errorMessage(files.error)}</Alert>}
        <Panel
          title={q ? 'Search results' : (path.data?.at(-1)?.name ?? 'My Drive')}
          counter={files.data ? `(${total.toLocaleString()})` : undefined}
          description={!q && folder !== 'root' ? (
            <nav aria-label="Folder path" className="flex flex-wrap items-center gap-1">
              {crumbs.map((c, i) => (
                <Fragment key={c.id ?? 'root'}>
                  {i > 0 && <span className="text-slate-400">/</span>}
                  {i === crumbs.length - 1 ? <span aria-current="location">{c.name}</span> : <Button variant="link" onClick={() => openFolder(c.id)}>{c.name}</Button>}
                </Fragment>
              ))}
            </nav>
          ) : undefined}
          actions={<Button variant="icon" ariaLabel="Table preferences" title="Table preferences" onClick={() => setEditingPrefs(true)}><SlidersHorizontal size={16} /></Button>}
          flush
        >
          <Toolbar
            pagination={
              <Pagination
                page={page}
                pages={Math.max(1, Math.ceil(total / prefs.pageSize))}
                onChange={(p) => update({ page: p === 1 ? null : String(p) })}
              />
            }
          >
            <SearchInput value={text} onChange={setText} placeholder="Search all file names" className="w-full max-w-sm" />
            <Checkbox checked={trashed} onChange={(on) => update({ trashed: on ? '1' : null, page: null })}>Show items in Trash</Checkbox>
          </Toolbar>
          <Table<DriveFileItem>
            items={files.data?.items ?? []}
            trackBy={(f) => f.google_file_id}
            columns={columns}
            visibleColumns={prefs.visibleContent}
            wrap={prefs.wrapLines}
            loading={files.isPending}
            loadingRows={10}
            dimmed={files.isPlaceholderData}
            sort={{ field: sort, desc: order === 'desc' }}
            onSort={(field, desc) => update({ sort: field, order: desc ? 'desc' : 'asc', page: null })}
            empty={
              q
                ? <EmptyState title="No files match your search">Try fewer letters, or check the spelling.</EmptyState>
                : <EmptyState title="This folder is empty">Or no scan has run yet. Start one from the dashboard.</EmptyState>
            }
          />
        </Panel>
      </div>
      {editingPrefs && (
        <PreferencesModal
          prefs={prefs}
          columns={columns}
          onDismiss={() => setEditingPrefs(false)}
          onConfirm={(next) => {
            setPrefs(next)
            setEditingPrefs(false)
            try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(next)) } catch { /* keep for this visit only */ }
            update({ page: null })
          }}
        />
      )}
    </div>
  )
}
