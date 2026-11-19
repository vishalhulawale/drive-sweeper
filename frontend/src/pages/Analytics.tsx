import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import BarList from '../components/charts/BarList'
import ColumnChart from '../components/charts/ColumnChart'
import StorageTreemap from '../components/charts/StorageTreemap'
import InfoLink from '../components/common/InfoLink'
import { Alert, AppLink, ExternalAnchor, PageHeader, Panel, Skeleton, StatTiles } from '../components/ui/core'
import { Table } from '../components/ui/table'
import { useByYear, useLargestFiles, useOverview } from '../hooks/useAnalytics'
import { useDuplicateSummary } from '../hooks/useDuplicates'
import { useNearStatus } from '../hooks/useNear'
import { errorMessage } from '../services/api'
import type { DriveFileItem } from '../types/file'
import { formatBytes, formatDate, friendlyType } from '../utils/format'

const chartStatus = (q: { isError: boolean; data: unknown }) => (q.isError ? 'error' : q.data ? 'finished' : 'loading') as 'error' | 'finished' | 'loading'

/** Size with a small inline bar relative to the largest value in the column. */
function SizeBar({ bytes, max }: { bytes: number; max: number }) {
  return (
    <div className="flex min-w-40 items-center gap-2">
      <div className="h-1.5 flex-1 bg-slate-100 dark:bg-slate-800">
        <div className="h-full bg-brand-500" style={{ width: `${max ? Math.max(2, (bytes / max) * 100) : 0}%` }} />
      </div>
      <span data-numeric className="min-w-16 text-right">{formatBytes(bytes)}</span>
    </div>
  )
}

export default function Analytics() {
  const [params, setParams] = useSearchParams()
  const folder = params.get('folder')
  const overview = useOverview()
  const years = useByYear()
  const files = useLargestFiles()
  const dups = useDuplicateSummary()
  const near = useNearStatus()
  const o = overview.data
  const v = (ready: unknown, x: ReactNode) => (ready ? x : <Skeleton className="h-6 w-24" />)
  const err = overview.error ?? years.error ?? files.error

  const categories = [...(o?.categories ?? [])].filter((c) => c.bytes > 0).sort((a, b) => b.bytes - a.bytes)
  const largest = files.data?.items ?? []
  const maxFile = Math.max(0, ...largest.map((f) => f.size ?? 0))

  return (
    <div>
      <PageHeader
        title="Storage analytics"
        info={<InfoLink />}
        description="Where your storage goes, from your last scan. Counts files you own; shared files and Google Docs, Sheets and Slides use none of your storage."
      />
      <div className="flex flex-col gap-6">
        {err != null && <Alert type="error">{errorMessage(err)}</Alert>}
        <StatTiles
          items={[
            { label: 'Storage used by files', value: v(o, formatBytes(o?.total_bytes)), detail: o && `in ${o.total_files.toLocaleString()} files` },
            { label: 'In Trash (still counts)', value: v(o, <AppLink to="/trash">{formatBytes(o?.trashed_bytes)}</AppLink>) },
            { label: 'Duplicates you can free', value: v(dups.data, <AppLink to="/duplicates">{formatBytes(dups.data?.potential_savings)}</AppLink>) },
            { label: 'Similar photos you can free', value: v(near.data, <AppLink to="/similar">Up to {formatBytes(near.data?.potential_savings)}</AppLink>) },
          ]}
        />

        <Panel title="Storage by folder" description="Area shows storage. Click a folder to look inside; arrow keys move between folders, Backspace goes up.">
          <StorageTreemap
            folder={folder}
            onFolderChange={(id) => {
              const next = new URLSearchParams(params)
              if (id) next.set('folder', id)
              else next.delete('folder')
              setParams(next)
            }}
          />
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="By file type">
            <BarList
              status={chartStatus(overview)}
              format={formatBytes}
              empty="No files scanned yet"
              rows={categories.map((c) => ({ key: c.category, label: c.category, value: c.bytes, detail: `${c.files.toLocaleString()} files` }))}
            />
          </Panel>
          <Panel title="By year created">
            <ColumnChart
              status={chartStatus(years)}
              format={formatBytes}
              height={240}
              ariaLabel="Storage used by the year files were created"
              empty="No files scanned yet"
              data={(years.data ?? []).map((y) => ({ x: String(y.year), y: y.bytes, detail: `${y.files.toLocaleString()} files` }))}
              tickEvery={(years.data?.length ?? 0) > 14 ? 2 : 1}
            />
          </Panel>
        </div>

        <Panel title="Largest files" counter={files.data ? `(${largest.length})` : undefined} description="The single files worth looking at first." flush>
          <Table<DriveFileItem>
            items={largest}
            trackBy={(f) => f.google_file_id}
            loading={files.isPending}
            columns={[
              { id: 'name', header: 'Name', cell: (f) => <ExternalAnchor href={f.web_view_link}>{f.name}</ExternalAnchor> },
              { id: 'type', header: 'Type', cell: (f) => friendlyType(f.mime_type) },
              { id: 'created', header: 'Created', cell: (f) => formatDate(f.created_time) },
              { id: 'size', header: 'Size', cell: (f) => <SizeBar bytes={f.size ?? 0} max={maxFile} /> },
            ]}
          />
        </Panel>
      </div>
    </div>
  )
}
