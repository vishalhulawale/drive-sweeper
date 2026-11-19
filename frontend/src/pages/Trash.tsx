import { useState, type ReactNode } from 'react'
import TrashTimeline from '../components/charts/TrashTimeline'
import EmptyState from '../components/common/EmptyState'
import InfoLink from '../components/common/InfoLink'
import { Alert, AppLink, Badge, Button, ExternalAnchor, PageHeader, Panel, Skeleton, StatTiles } from '../components/ui/core'
import { Pagination, Table } from '../components/ui/table'
import { useRefreshTrashDates, useTrashItems, useTrashOverview, useTrashTimeline } from '../hooks/useTrash'
import { useNotify } from '../layouts/notifications'
import { errorMessage } from '../services/api'
import type { TrashItem, TrashSort } from '../types/trash'
import { formatBytes, formatDate } from '../utils/format'

const PAGE_SIZE = 50

function daysLeft(iso: string | null): number | null {
  if (!iso) return null
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

export default function Trash() {
  const [sort, setSort] = useState<TrashSort>('size')
  const [page, setPage] = useState(1)
  const overview = useTrashOverview()
  const items = useTrashItems(sort, page, PAGE_SIZE)
  const timeline = useTrashTimeline()
  const refresh = useRefreshTrashDates()
  const { notify } = useNotify()
  const o = overview.data
  const v = (x: ReactNode) => (o ? x : <Skeleton className="h-6 w-24" />)
  const total = items.data?.total ?? 0

  const fetchDates = () =>
    refresh.mutate(undefined, {
      onSuccess: (r) => notify({ id: 'trash-dates', type: 'success', autoDismissMs: 8000, content: `Checked ${r.seen.toLocaleString()} items; updated ${r.updated.toLocaleString()} dates.` }),
      onError: (e) => notify({ id: 'trash-dates', type: 'error', header: "Couldn't fetch dates", content: errorMessage(e) }),
    })

  return (
    <div>
      <PageHeader
        title="Trash"
        info={<InfoLink />}
        description={`Files you own in Google Drive's Trash. They still use storage until Drive deletes them, ${o?.auto_delete_days ?? 30} days after they were trashed.`}
        actions={<Button href={o?.drive_trash_url ?? 'https://drive.google.com/drive/trash'} newTab>Open Drive Trash</Button>}
      />
      <div className="flex flex-col gap-6">
        {overview.isError && <Alert type="error">{errorMessage(overview.error)}</Alert>}
        <Alert type="info">
          To free this space sooner, empty the Trash in Drive. That is permanent, so DriveClean doesn&apos;t do it for you.
          Trashed something by mistake? Restore it from the <AppLink to="/cleanup">Cleanup history</AppLink> before Drive deletes it.
        </Alert>
        {o && o.undated_files > 0 && (
          <Alert type="warning" action={<Button onClick={fetchDates} loading={refresh.isPending}>Fetch dates</Button>}>
            {o.undated_files.toLocaleString()} files have no trashed date yet, so when Drive deletes them is unknown. Fetching
            the dates only reads from Drive.
          </Alert>
        )}

        <StatTiles
          items={[
            { label: 'Taking up space', value: v(formatBytes(o?.bytes)), detail: o && `in ${o.files.toLocaleString()} files` },
            { label: 'Deleted by Drive within 7 days', value: v(formatBytes(o?.deleting_soon_bytes)), detail: o && `in ${o.deleting_soon_files.toLocaleString()} files` },
            { label: 'Next automatic deletion', value: v(o?.next_auto_delete_at ? formatDate(o.next_auto_delete_at) : 'None due') },
          ]}
        />

        {(!o || o.files > 0) && (
          <Panel title="Deletion timeline" description="Space Drive frees each day over the next 30 days.">
            <TrashTimeline
              items={timeline.data?.items}
              status={timeline.isError ? 'error' : timeline.data ? 'finished' : 'loading'}
              onRetry={() => timeline.refetch()}
            />
          </Panel>
        )}

        <Panel
          title="Items in Trash"
          counter={items.data ? `(${total.toLocaleString()})` : undefined}
          actions={<Pagination page={page} pages={Math.max(1, Math.ceil(total / PAGE_SIZE))} onChange={setPage} />}
          flush
        >
          <Table<TrashItem>
            items={items.data?.items ?? []}
            trackBy={(i) => i.file.google_file_id}
            loading={items.isPending}
            dimmed={items.isPlaceholderData}
            sort={{ field: sort, desc: sort === 'size' }}
            onSort={(f) => { setSort(f as TrashSort); setPage(1) }}
            columns={[
              {
                id: 'name', header: 'Name', sortField: 'name',
                cell: (i) => (
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <ExternalAnchor href={i.file.web_view_link}>{i.file.name}</ExternalAnchor>
                    {i.trashed_by_app && <Badge color="blue">Trashed in DriveClean</Badge>}
                  </span>
                ),
              },
              { id: 'trashed', header: 'Trashed', cell: (i) => formatDate(i.trashed_at) },
              {
                id: 'deletes', header: 'Deleted by Drive', sortField: 'deletes',
                cell: (i) => {
                  const left = daysLeft(i.auto_deletes_at)
                  if (left === null) return '—'
                  return (
                    <div className="flex flex-col gap-0.5">
                      <span>{formatDate(i.auto_deletes_at)}</span>
                      <span className={left <= 7 ? 'text-xs font-semibold text-amber-700 dark:text-amber-400' : 'text-xs text-slate-500'}>
                        {left <= 0 ? 'Due now' : `In ${left} day${left === 1 ? '' : 's'}`}
                      </span>
                    </div>
                  )
                },
              },
              { id: 'size', header: 'Size', sortField: 'size', align: 'right', cell: (i) => formatBytes(i.file.size) },
            ]}
            empty={<EmptyState title="Your Trash is empty">Files you move to Trash appear here until Drive deletes them.</EmptyState>}
          />
        </Panel>
      </div>
    </div>
  )
}
