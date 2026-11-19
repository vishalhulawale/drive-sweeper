import { useCollection } from '@cloudscape-design/collection-hooks'
import Alert from '@cloudscape-design/components/alert'
import Box from '@cloudscape-design/components/box'
import Container from '@cloudscape-design/components/container'
import ContentLayout from '@cloudscape-design/components/content-layout'
import Header from '@cloudscape-design/components/header'
import LineChart from '@cloudscape-design/components/line-chart'
import Pagination from '@cloudscape-design/components/pagination'
import Table from '@cloudscape-design/components/table'
import SpaceBetween from '@cloudscape-design/components/space-between'
import { colorChartsPaletteCategorical1 } from '@cloudscape-design/design-tokens'
import EmptyState from '../components/common/EmptyState'
import InfoLink from '../components/common/InfoLink'
import { ScanStatusIndicator } from '../components/common/status'
import { useScans } from '../hooks/useScan'
import { errorMessage } from '../services/api'
import type { Scan } from '../types/scan'
import { formatDate, formatDuration } from '../utils/format'

const shortDate = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
const dateTime = (d: Date) => d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function ScanHistory() {
  const scans = useScans()
  const data = scans.data ?? []
  const done = data.filter((s) => s.status === 'completed' && s.completed_at).sort((a, b) => a.started_at.localeCompare(b.started_at))
  const spanDays = done.length > 1 ? (new Date(done[done.length - 1].started_at).getTime() - new Date(done[0].started_at).getTime()) / 86_400_000 : 0
  const { items, collectionProps, paginationProps } = useCollection(data, {
    pagination: { pageSize: 25 },
    filtering: { empty: <EmptyState title="No scans yet">Start a scan from the dashboard to read your Drive.</EmptyState> },
  })

  return (
    <ContentLayout
      header={
        <Header variant="h1" info={<InfoLink />} description="Every full scan of your Drive. Quick syncs between scans aren't listed.">
          Scan history
        </Header>
      }
    >
      <SpaceBetween size="l">
        {scans.isError && <Alert type="error">{errorMessage(scans.error)}</Alert>}
        {done.length > 1 && (
          <Container header={<Header variant="h2" description="Files found by each completed scan.">Files over time</Header>}>
            <LineChart
              height={200}
              hideFilter
              hideLegend
              xScaleType="time"
              series={[{
                title: 'Files found', type: 'line', color: colorChartsPaletteCategorical1,
                data: done.map((s) => ({ x: new Date(s.started_at), y: s.processed_files })),
                valueFormatter: (v) => v.toLocaleString(),
              }]}
              xTickFormatter={spanDays < 3 ? dateTime : shortDate}
              yTickFormatter={(v) => v.toLocaleString()}
              detailPopoverFooter={(x) => {
                const s = done.find((d) => new Date(d.started_at).getTime() === (x as Date).getTime())
                return s ? <Box fontSize="body-s" color="text-body-secondary">Took {formatDuration(s.started_at, s.completed_at)}</Box> : null
              }}
              ariaLabel="Files found by each completed scan"
              xTitle="Scan date"
              yTitle="Files"
            />
          </Container>
        )}
        <Table<Scan>
          {...collectionProps}
          trackBy="id"
          items={items}
          loading={scans.isPending}
          loadingText="Loading scans"
          header={<Header counter={scans.data ? `(${data.length})` : undefined}>Scans</Header>}
          pagination={<Pagination {...paginationProps} ariaLabels={{ nextPageLabel: 'Next page', previousPageLabel: 'Previous page', pageLabel: (n) => `Page ${n}` }} />}
          columnDefinitions={[
            { id: 'started', header: 'Started', isRowHeader: true, cell: (s) => formatDate(s.started_at) },
            { id: 'status', header: 'Status', cell: (s) => <ScanStatusIndicator status={s.status} /> },
            { id: 'files', header: 'Files', cell: (s) => s.processed_files.toLocaleString() },
            { id: 'duration', header: 'Duration', cell: (s) => formatDuration(s.started_at, s.completed_at) },
            { id: 'error', header: 'Details', cell: (s) => (s.error_message ? <Box color="text-status-error" fontSize="body-s">{s.error_message}</Box> : '') },
          ]}
        />
      </SpaceBetween>
    </ContentLayout>
  )
}
