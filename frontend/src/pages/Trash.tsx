import Alert from '@cloudscape-design/components/alert'
import Badge from '@cloudscape-design/components/badge'
import Box from '@cloudscape-design/components/box'
import Button from '@cloudscape-design/components/button'
import Container from '@cloudscape-design/components/container'
import ContentLayout from '@cloudscape-design/components/content-layout'
import Header from '@cloudscape-design/components/header'
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs'
import Link from '@cloudscape-design/components/link'
import Pagination from '@cloudscape-design/components/pagination'
import Skeleton from '@cloudscape-design/components/skeleton'
import SpaceBetween from '@cloudscape-design/components/space-between'
import Table from '@cloudscape-design/components/table'
import { useState, type ReactNode } from 'react'
import TrashTimeline from '../components/charts/TrashTimeline'
import EmptyState from '../components/common/EmptyState'
import InfoLink from '../components/common/InfoLink'
import { AppLink } from '../components/common/RouterLink'
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
  const v = (x: ReactNode) => (o ? x : <Skeleton variant="text-body-m" width="100px" />)
  const total = items.data?.total ?? 0

  const fetchDates = () =>
    refresh.mutate(undefined, {
      onSuccess: (r) => notify({ id: 'trash-dates', type: 'success', autoDismissMs: 8000, content: `Checked ${r.seen.toLocaleString()} items; updated ${r.updated.toLocaleString()} dates.` }),
      onError: (e) => notify({ id: 'trash-dates', type: 'error', header: "Couldn't fetch dates", content: errorMessage(e) }),
    })

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          info={<InfoLink />}
          description={`Files you own in Google Drive's Trash. They still use storage until Drive deletes them, ${o?.auto_delete_days ?? 30} days after they were trashed.`}
          actions={
            <Button href={o?.drive_trash_url ?? 'https://drive.google.com/drive/trash'} target="_blank" iconName="external" iconAlign="right">
              Open Drive Trash
            </Button>
          }
        >
          Trash
        </Header>
      }
    >
      <SpaceBetween size="l">
        {overview.isError && <Alert type="error">{errorMessage(overview.error)}</Alert>}
        <Alert type="info">
          To free this space sooner, empty the Trash in Drive. That is permanent, so DriveClean doesn&apos;t do it for you.
          Trashed something by mistake? Restore it from the <AppLink href="/cleanup">Cleanup history</AppLink> before Drive deletes it.
        </Alert>
        {o && o.undated_files > 0 && (
          <Alert type="warning" action={<Button onClick={fetchDates} loading={refresh.isPending}>Fetch dates</Button>}>
            {o.undated_files.toLocaleString()} files have no trashed date yet, so when Drive deletes them is unknown. Fetching
            the dates only reads from Drive.
          </Alert>
        )}

        <Container header={<Header variant="h2">Overview</Header>}>
          <SpaceBetween size="l">
            <KeyValuePairs
              columns={3}
              items={[
                { label: 'Taking up space', value: v(<>{formatBytes(o?.bytes)} <Box variant="span" color="text-body-secondary">in {o?.files.toLocaleString()} files</Box></>) },
                { label: 'Deleted by Drive within 7 days', value: v(<>{formatBytes(o?.deleting_soon_bytes)} <Box variant="span" color="text-body-secondary">in {o?.deleting_soon_files.toLocaleString()} files</Box></>) },
                { label: 'Next automatic deletion', value: v(o?.next_auto_delete_at ? formatDate(o.next_auto_delete_at) : 'None due') },
              ]}
            />
            {(!o || o.files > 0) && (
              <TrashTimeline
                items={timeline.data?.items}
                status={timeline.isError ? 'error' : timeline.data ? 'finished' : 'loading'}
                onRetry={() => timeline.refetch()}
              />
            )}
          </SpaceBetween>
        </Container>

        <Table<TrashItem>
          trackBy={(i) => i.file.google_file_id}
          items={items.data?.items ?? []}
          loading={items.isPending}
          loadingText="Loading Trash"
          sortingColumn={{ sortingField: sort }}
          sortingDescending={sort === 'size'}
          onSortingChange={(e) => {
            const f = e.detail.sortingColumn.sortingField as TrashSort | undefined
            if (f) { setSort(f); setPage(1) }
          }}
          header={<Header counter={items.data ? `(${total.toLocaleString()})` : undefined}>Items in Trash</Header>}
          columnDefinitions={[
            {
              id: 'name', header: 'Name', sortingField: 'name', isRowHeader: true,
              cell: (i) => (
                <SpaceBetween direction="horizontal" size="xs">
                  <Link href={i.file.web_view_link ?? undefined} external externalIconAriaLabel="(opens in Google Drive)">{i.file.name}</Link>
                  {i.trashed_by_app && <Badge>Trashed in DriveClean</Badge>}
                </SpaceBetween>
              ),
            },
            { id: 'trashed', header: 'Trashed', cell: (i) => formatDate(i.trashed_at) },
            {
              id: 'deletes', header: 'Deleted by Drive', sortingField: 'deletes',
              cell: (i) => {
                const left = daysLeft(i.auto_deletes_at)
                if (left === null) return '—'
                return (
                  <SpaceBetween size="xxxs">
                    <span>{formatDate(i.auto_deletes_at)}</span>
                    <Box fontSize="body-s" color={left <= 7 ? 'text-status-warning' : 'text-body-secondary'}>
                      {left <= 0 ? 'Due now' : `In ${left} day${left === 1 ? '' : 's'}`}
                    </Box>
                  </SpaceBetween>
                )
              },
            },
            { id: 'size', header: 'Size', sortingField: 'size', cell: (i) => formatBytes(i.file.size) },
          ]}
          pagination={
            <Pagination
              currentPageIndex={page}
              pagesCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
              onChange={(e) => setPage(e.detail.currentPageIndex)}
              ariaLabels={{ nextPageLabel: 'Next page', previousPageLabel: 'Previous page', pageLabel: (n) => `Page ${n}` }}
            />
          }
          empty={<EmptyState title="Your Trash is empty">Files you move to Trash appear here until Drive deletes them.</EmptyState>}
        />
      </SpaceBetween>
    </ContentLayout>
  )
}
