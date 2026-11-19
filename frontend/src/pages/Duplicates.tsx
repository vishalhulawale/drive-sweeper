import { useEffect, useMemo, useState } from 'react'
import EmptyState from '../components/common/EmptyState'
import InfoLink from '../components/common/InfoLink'
import DecisionControl from '../components/review/DecisionControl'
import { useBulkApply } from '../components/review/useBulkApply'
import { Alert, Button, ExternalAnchor, PageHeader, Panel, Secondary } from '../components/ui/core'
import { Dropdown, Modal } from '../components/ui/overlay'
import { Pagination, Table, Toolbar, type Column } from '../components/ui/table'
import { useCleanupPlan } from '../hooks/useCleanup'
import { useDetectDuplicates, useDuplicateGroups, useDuplicateSummary, usePrefetchGroups } from '../hooks/useDuplicates'
import { useSyncOnOpen } from '../hooks/useSync'
import { useNotify } from '../layouts/notifications'
import { errorMessage } from '../services/api'
import type { DuplicateEntry, DuplicateGroup, DuplicateSort } from '../types/duplicate'
import { formatBytes, formatDate } from '../utils/format'

const PAGE_SIZE = 20

type Row = { kind: 'group'; id: string; group: DuplicateGroup } | { kind: 'file'; id: string; group: DuplicateGroup; entry: DuplicateEntry }

const groupRow = (g: DuplicateGroup): Row => ({ kind: 'group', id: `g${g.id}`, group: g })
const fileRows = (g: DuplicateGroup): Row[] => g.files.map((e) => ({ kind: 'file', id: `e${e.entry_id}`, group: g, entry: e }))

function groupState(g: DuplicateGroup) {
  const trash = g.files.filter((e) => e.user_selected_action === 'trash').length
  const open = g.files.filter((e) => e.user_selected_action === null).length
  if (open === g.files.length) return 'Not reviewed'
  if (open) return `${trash} marked, ${open} to decide`
  return trash ? `${trash} of ${g.files.length} marked for Trash` : 'Keeping all'
}

const COLUMNS: Column<Row>[] = [
  {
    id: 'name', header: 'Name', className: 'min-w-64',
    cell: (r) => r.kind === 'group'
      ? <span className="font-semibold">{r.group.files[0]?.file.name ?? 'Group'}</span>
      : <ExternalAnchor href={r.entry.file.web_view_link}>{r.entry.file.name}</ExternalAnchor>,
  },
  { id: 'count', header: 'Copies', sortField: 'count', align: 'right', cell: (r) => (r.kind === 'group' ? r.group.file_count : null) },
  {
    id: 'size', header: 'Size', sortField: 'size', align: 'right',
    cell: (r) => (r.kind === 'group' ? `${formatBytes(r.group.file_size)} each` : formatBytes(r.entry.file.size)),
  },
  {
    id: 'savings', header: 'You can free', sortField: 'savings', align: 'right',
    cell: (r) => (r.kind === 'group' ? <span className="font-semibold">{formatBytes(r.group.potential_savings)}</span> : null),
  },
  { id: 'created', header: 'Created', cell: (r) => (r.kind === 'file' ? formatDate(r.entry.file.created_time) : null) },
  { id: 'modified', header: 'Modified', cell: (r) => (r.kind === 'file' ? formatDate(r.entry.file.modified_time) : null) },
  {
    id: 'decision', header: 'Decision', className: 'min-w-44',
    cell: (r) => r.kind === 'file'
      ? <DecisionControl entry={r.entry} name={r.entry.file.name} />
      : <Secondary className="text-xs">{groupState(r.group)}</Secondary>,
  },
]

export default function Duplicates() {
  const [sort, setSortState] = useState<DuplicateSort>('savings')
  const [page, setPageState] = useState(1)
  const [selected, setSelected] = useState<Row[]>([])
  useSyncOnOpen() // catch files deleted or changed directly in Drive
  // Selection belongs to the page it was made on.
  const setPage = (p: number) => { setPageState(p); setSelected([]) }
  const setSort = (s: DuplicateSort) => { setSortState(s); setPageState(1); setSelected([]) }
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [confirmAll, setConfirmAll] = useState(false)
  const summary = useDuplicateSummary()
  const groups = useDuplicateGroups(sort, page, PAGE_SIZE)
  const detect = useDetectDuplicates()
  const plan = useCleanupPlan()
  const bulk = useBulkApply('exact')
  const prefetch = usePrefetchGroups()
  const { notify } = useNotify()

  const total = groups.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const items = useMemo(() => (groups.data?.items ?? []).map(groupRow), [groups.data])
  const selectedGroups = selected.filter((r) => r.kind === 'group').map((r) => r.group)

  useEffect(() => {
    if (page < pages) prefetch(sort, page + 1, PAGE_SIZE, 'exact')
  }, [page, pages, sort, prefetch])

  const runDetect = () =>
    detect.mutate(undefined, {
      onSuccess: (s) => notify({
        id: 'dup-detect', type: 'success', autoDismissMs: 8000,
        content: `Found ${s.groups.toLocaleString()} groups of duplicates (${s.duplicate_files.toLocaleString()} files, up to ${formatBytes(s.potential_savings)}).`,
      }),
      onError: (e) => notify({ id: 'dup-detect', type: 'error', header: "Couldn't find duplicates", content: errorMessage(e) }),
    })

  const marked = plan.data?.count ?? 0
  const s = summary.data

  return (
    <div>
      <PageHeader
        title="Duplicates"
        counter={s ? `(${s.groups.toLocaleString()})` : undefined}
        info={<InfoLink />}
        description={
          s
            ? `Exact copies of the same file: ${s.duplicate_files.toLocaleString()} files, up to ${formatBytes(s.potential_savings)} you can free.`
            : 'Exact copies of the same file.'
        }
        actions={
          <>
            <Button onClick={runDetect} loading={detect.isPending}>Find duplicates</Button>
            <Button to="/cleanup" variant="primary" disabled={!marked}>
              {marked ? `Review ${marked.toLocaleString()} in Cleanup` : 'Review in Cleanup'}
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-4">
        {groups.isError && <Alert type="error">{errorMessage(groups.error)}</Alert>}
        <Panel
          title="Groups"
          counter={selectedGroups.length ? `(${selectedGroups.length} selected)` : undefined}
          description="The oldest copy in each group is suggested to keep. Applying suggestions marks the other copies for Trash; nothing changes in Drive until you use Cleanup."
          actions={
            <Dropdown
              label="Apply suggestions"
              loading={bulk.isPending}
              disabled={!items.length}
              items={[
                { id: 'selected', text: `To selected groups (${selectedGroups.length})`, disabled: !selectedGroups.length },
                { id: 'page', text: `To this page (${items.length} groups)` },
                { id: 'all', text: `To all ${total.toLocaleString()} groups…` },
              ]}
              onItemClick={(id) => {
                if (id === 'all') setConfirmAll(true)
                else bulk.run(id === 'selected' ? selectedGroups : items.map((r) => r.group))
              }}
            />
          }
          flush
        >
          <Toolbar pagination={<Pagination page={page} pages={pages} onChange={setPage} />}>
            <Secondary>Sorted by {sort === 'savings' ? 'space you can free' : sort === 'count' ? 'number of copies' : 'file size'}</Secondary>
          </Toolbar>
          <Table<Row>
            items={items}
            trackBy={(r) => r.id}
            columns={COLUMNS}
            loading={groups.isPending}
            dimmed={groups.isPlaceholderData}
            sort={{ field: sort, desc: true }}
            onSort={(f) => setSort(f as DuplicateSort)}
            selection={{
              selected,
              onChange: (rows) => setSelected(rows.filter((r) => r.kind === 'group')),
              isDisabled: (r) => r.kind === 'file',
              label: (r) => (r.kind === 'group' ? `Select group ${r.group.files[0]?.file.name ?? ''}` : ''),
            }}
            tree={{
              isParent: (r) => r.kind === 'group',
              children: (r) => (r.kind === 'group' ? fileRows(r.group) : []),
              isExpanded: (r) => !collapsed.has(r.group.id),
              onToggle: (r, open) => setCollapsed((c) => {
                const next = new Set(c)
                if (open) next.delete(r.group.id)
                else next.add(r.group.id)
                return next
              }),
            }}
            empty={
              <EmptyState title="No duplicates found" action={<Button onClick={runDetect} loading={detect.isPending}>Find duplicates</Button>}>
                Run a scan first, then find duplicates. Google Docs, Sheets and Slides are never matched.
              </EmptyState>
            }
          />
          {pages > 1 && <div className="flex justify-end border-t border-line px-4 py-2 dark:border-slate-700"><Pagination page={page} pages={pages} onChange={(p) => { setPage(p); window.scrollTo({ top: 0 }) }} /></div>}
        </Panel>
      </div>
      <Modal
        visible={confirmAll}
        onDismiss={() => setConfirmAll(false)}
        header={`Apply suggestions to all ${total.toLocaleString()} groups?`}
        footer={
          <>
            <Button variant="link" className="mr-2" onClick={() => setConfirmAll(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { setConfirmAll(false); bulk.run('all', total) }}>Apply to all groups</Button>
          </>
        }
      >
        In every group the oldest copy is kept and the other copies are marked for Trash, replacing choices you made
        before. Nothing changes in Drive: you review the marked files in Cleanup before anything moves.
      </Modal>
    </div>
  )
}
