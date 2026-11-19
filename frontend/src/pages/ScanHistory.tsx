import LineChart from '../components/charts/LineChart'
import EmptyState from '../components/common/EmptyState'
import InfoLink from '../components/common/InfoLink'
import { ScanStatusIndicator } from '../components/common/status'
import { Alert, PageHeader, Panel } from '../components/ui/core'
import { Pagination, Table, useCollection } from '../components/ui/table'
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
  const list = useCollection(data, { pageSize: 25 })

  return (
    <div>
      <PageHeader title="Scan history" info={<InfoLink />} description="Every full scan of your Drive. Quick syncs between scans aren't listed." />
      <div className="flex flex-col gap-6">
        {scans.isError && <Alert type="error">{errorMessage(scans.error)}</Alert>}
        {done.length > 1 && (
          <Panel title="Files over time" description="Files found by each completed scan.">
            <LineChart
              points={done.map((s) => ({ x: new Date(s.started_at), y: s.processed_files, detail: `Took ${formatDuration(s.started_at, s.completed_at)}` }))}
              formatX={spanDays < 3 ? dateTime : shortDate}
              formatY={(v) => Math.round(v).toLocaleString()}
              ariaLabel="Files found by each completed scan"
            />
          </Panel>
        )}
        <Panel
          title="Scans"
          counter={scans.data ? `(${data.length})` : undefined}
          actions={<Pagination page={list.page} pages={list.pages} onChange={list.setPage} />}
          flush
        >
          <Table<Scan>
            items={list.items}
            trackBy={(s) => s.id}
            loading={scans.isPending}
            empty={<EmptyState title="No scans yet">Start a scan from the dashboard to read your Drive.</EmptyState>}
            columns={[
              { id: 'started', header: 'Started', cell: (s) => <span className="font-medium">{formatDate(s.started_at)}</span> },
              { id: 'status', header: 'Status', cell: (s) => <ScanStatusIndicator status={s.status} /> },
              { id: 'files', header: 'Files', align: 'right', cell: (s) => s.processed_files.toLocaleString() },
              { id: 'duration', header: 'Duration', align: 'right', cell: (s) => formatDuration(s.started_at, s.completed_at) },
              { id: 'error', header: 'Details', cell: (s) => (s.error_message ? <span className="text-xs text-rose-600">{s.error_message}</span> : '') },
            ]}
          />
        </Panel>
      </div>
    </div>
  )
}
