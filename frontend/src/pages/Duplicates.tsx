import Alert from '@cloudscape-design/components/alert'
import Box from '@cloudscape-design/components/box'
import Button from '@cloudscape-design/components/button'
import ButtonDropdown from '@cloudscape-design/components/button-dropdown'
import ContentLayout from '@cloudscape-design/components/content-layout'
import Header from '@cloudscape-design/components/header'
import Link from '@cloudscape-design/components/link'
import Modal from '@cloudscape-design/components/modal'
import Pagination from '@cloudscape-design/components/pagination'
import SpaceBetween from '@cloudscape-design/components/space-between'
import Table, { type TableProps } from '@cloudscape-design/components/table'
import { useEffect, useMemo, useState } from 'react'
import EmptyState from '../components/common/EmptyState'
import InfoLink from '../components/common/InfoLink'
import { AppButtonLink } from '../components/common/RouterLink'
import DecisionControl from '../components/review/DecisionControl'
import { useBulkApply } from '../components/review/useBulkApply'
import { useCleanupPlan } from '../hooks/useCleanup'
import { useDetectDuplicates, useDuplicateGroups, useDuplicateSummary, usePrefetchGroups } from '../hooks/useDuplicates'
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

const COLUMNS: TableProps.ColumnDefinition<Row>[] = [
  {
    id: 'name', header: 'Name', isRowHeader: true, width: 300,
    cell: (r) => r.kind === 'group'
      ? <Box variant="span" fontWeight="bold">{r.group.files[0]?.file.name ?? 'Group'}</Box>
      : <Link href={r.entry.file.web_view_link ?? undefined} external externalIconAriaLabel="(opens in Google Drive)">{r.entry.file.name}</Link>,
  },
  {
    id: 'count', header: 'Copies', sortingField: 'count',
    cell: (r) => (r.kind === 'group' ? r.group.file_count : null),
  },
  {
    id: 'size', header: 'Size', sortingField: 'size',
    cell: (r) => (r.kind === 'group' ? `${formatBytes(r.group.file_size)} each` : formatBytes(r.entry.file.size)),
  },
  {
    id: 'savings', header: 'You can free', sortingField: 'savings',
    cell: (r) => (r.kind === 'group' ? formatBytes(r.group.potential_savings) : null),
  },
  { id: 'created', header: 'Created', cell: (r) => (r.kind === 'file' ? formatDate(r.entry.file.created_time) : null) },
  { id: 'modified', header: 'Modified', cell: (r) => (r.kind === 'file' ? formatDate(r.entry.file.modified_time) : null) },
  {
    id: 'decision', header: 'Decision', minWidth: 240,
    cell: (r) => r.kind === 'file'
      ? <DecisionControl entry={r.entry} name={r.entry.file.name} />
      : <Box color="text-body-secondary" fontSize="body-s">{groupState(r.group)}</Box>,
  },
]

export default function Duplicates() {
  const [sort, setSortState] = useState<DuplicateSort>('savings')
  const [page, setPageState] = useState(1)
  const [selected, setSelected] = useState<Row[]>([])
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
  const expanded = items.filter((r) => !collapsed.has(r.group.id))
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
    <ContentLayout
      header={
        <Header
          variant="h1"
          counter={s ? `(${s.groups.toLocaleString()})` : undefined}
          info={<InfoLink />}
          description={
            s
              ? `Exact copies of the same file: ${s.duplicate_files.toLocaleString()} files, up to ${formatBytes(s.potential_savings)} you can free.`
              : 'Exact copies of the same file.'
          }
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={runDetect} loading={detect.isPending}>Find duplicates</Button>
              <AppButtonLink href="/cleanup" variant="primary" disabled={!marked}>
                {marked ? `Review ${marked.toLocaleString()} in Cleanup` : 'Review in Cleanup'}
              </AppButtonLink>
            </SpaceBetween>
          }
        >
          Duplicates
        </Header>
      }
    >
      <SpaceBetween size="l">
        {groups.isError && <Alert type="error">{errorMessage(groups.error)}</Alert>}
        <Table<Row>
          variant="full-page"
          trackBy="id"
          items={items}
          columnDefinitions={COLUMNS}
          stickyColumns={{ first: 0, last: 1 }}
          resizableColumns
          loading={groups.isPending}
          loadingText="Loading duplicate groups"
          selectionType="multi"
          selectedItems={selected}
          onSelectionChange={(e) => setSelected(e.detail.selectedItems.filter((r) => r.kind === 'group'))}
          isItemDisabled={(r) => r.kind === 'file'}
          expandableRows={{
            getItemChildren: (r) => (r.kind === 'group' ? fileRows(r.group) : []),
            isItemExpandable: (r) => r.kind === 'group',
            expandedItems: expanded,
            onExpandableItemToggle: ({ detail }) => {
              if (detail.item.kind !== 'group') return
              const id = detail.item.group.id
              setCollapsed((c) => {
                const next = new Set(c)
                if (detail.expanded) next.delete(id)
                else next.add(id)
                return next
              })
            },
          }}
          sortingColumn={{ sortingField: sort }}
          sortingDescending
          onSortingChange={(e) => {
            const f = e.detail.sortingColumn.sortingField as DuplicateSort | undefined
            if (f) setSort(f)
          }}
          ariaLabels={{
            selectionGroupLabel: 'Group selection',
            itemSelectionLabel: (_, r) => (r.kind === 'group' ? `Select group ${r.group.files[0]?.file.name ?? ''}` : ''),
            allItemsSelectionLabel: () => 'Select all groups on this page',
          }}
          header={
            <Header
              variant="awsui-h1-sticky"
              counter={selectedGroups.length ? `(${selectedGroups.length} selected)` : undefined}
              actions={
                <ButtonDropdown
                  variant="normal"
                  loading={bulk.isPending}
                  disabled={!items.length}
                  items={[
                    { id: 'selected', text: `To selected groups (${selectedGroups.length})`, disabled: !selectedGroups.length },
                    { id: 'page', text: `To this page (${items.length} groups)` },
                    { id: 'all', text: `To all ${total.toLocaleString()} groups…` },
                  ]}
                  onItemClick={({ detail }) => {
                    if (detail.id === 'all') setConfirmAll(true)
                    else bulk.run(detail.id === 'selected' ? selectedGroups : items.map((r) => r.group))
                  }}
                >
                  Apply suggestions
                </ButtonDropdown>
              }
              description="The oldest copy in each group is suggested to keep. Applying suggestions marks the other copies for Trash; nothing changes in Drive until you use Cleanup."
            >
              Groups
            </Header>
          }
          pagination={
            <Pagination
              currentPageIndex={page}
              pagesCount={pages}
              onChange={(e) => setPage(e.detail.currentPageIndex)}
              ariaLabels={{ nextPageLabel: 'Next page', previousPageLabel: 'Previous page', pageLabel: (n) => `Page ${n}` }}
            />
          }
          empty={
            <EmptyState
              title="No duplicates found"
              action={<Button onClick={runDetect} loading={detect.isPending}>Find duplicates</Button>}
            >
              Run a scan first, then find duplicates. Google Docs, Sheets and Slides are never matched.
            </EmptyState>
          }
        />
      </SpaceBetween>
      <Modal
        visible={confirmAll}
        onDismiss={() => setConfirmAll(false)}
        header={`Apply suggestions to all ${total.toLocaleString()} groups?`}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setConfirmAll(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => { setConfirmAll(false); bulk.run('all', total) }}>Apply to all groups</Button>
            </SpaceBetween>
          </Box>
        }
      >
        In every group the oldest copy is kept and the other copies are marked for Trash, replacing choices you made
        before. Nothing changes in Drive: you review the marked files in Cleanup before anything moves.
      </Modal>
    </ContentLayout>
  )
}
