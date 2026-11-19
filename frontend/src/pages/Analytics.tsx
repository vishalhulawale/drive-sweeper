import Alert from '@cloudscape-design/components/alert'
import BarChart from '@cloudscape-design/components/bar-chart'
import Box from '@cloudscape-design/components/box'
import Container from '@cloudscape-design/components/container'
import ContentLayout from '@cloudscape-design/components/content-layout'
import Grid from '@cloudscape-design/components/grid'
import Header from '@cloudscape-design/components/header'
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs'
import Link from '@cloudscape-design/components/link'
import Skeleton from '@cloudscape-design/components/skeleton'
import SpaceBetween from '@cloudscape-design/components/space-between'
import Table from '@cloudscape-design/components/table'
import { colorBorderDividerDefault, colorChartsPaletteCategorical1 } from '@cloudscape-design/design-tokens'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import StorageTreemap from '../components/charts/StorageTreemap'
import InfoLink from '../components/common/InfoLink'
import { AppLink } from '../components/common/RouterLink'
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 160 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: colorBorderDividerDefault }}>
        <div style={{ width: `${max ? Math.max(2, (bytes / max) * 100) : 0}%`, height: '100%', borderRadius: 3, background: colorChartsPaletteCategorical1 }} />
      </div>
      <span data-numeric style={{ minWidth: 64, textAlign: 'right' }}>{formatBytes(bytes)}</span>
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
  const v = (ready: unknown, x: ReactNode) => (ready ? x : <Skeleton variant="text-body-m" width="100px" />)
  const err = overview.error ?? years.error ?? files.error

  const categories = [...(o?.categories ?? [])].filter((c) => c.bytes > 0).sort((a, b) => b.bytes - a.bytes)
  const largest = files.data?.items ?? []
  const maxFile = Math.max(0, ...largest.map((f) => f.size ?? 0))

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          info={<InfoLink />}
          description="Where your storage goes, from your last scan. Counts files you own; shared files and Google Docs, Sheets and Slides use none of your storage."
        >
          Storage analytics
        </Header>
      }
    >
      <SpaceBetween size="l">
        {err != null && <Alert type="error">{errorMessage(err)}</Alert>}
        <Container>
          <KeyValuePairs
            columns={4}
            items={[
              { label: 'Storage used by files', value: v(o, <>{formatBytes(o?.total_bytes)} <Box variant="span" color="text-body-secondary">in {o?.total_files.toLocaleString()} files</Box></>) },
              { label: 'In Trash (still counts)', value: v(o, <AppLink href="/trash">{formatBytes(o?.trashed_bytes)}</AppLink>) },
              { label: 'Duplicates you can free', value: v(dups.data, <AppLink href="/duplicates">{formatBytes(dups.data?.potential_savings)}</AppLink>) },
              { label: 'Similar photos you can free', value: v(near.data, <AppLink href="/similar">Up to {formatBytes(near.data?.potential_savings)}</AppLink>) },
            ]}
          />
        </Container>

        <Container
          header={
            <Header variant="h2" description="Area shows storage. Click a folder to look inside; arrow keys move between folders, Backspace goes up.">
              Storage by folder
            </Header>
          }
        >
          <StorageTreemap
            folder={folder}
            onFolderChange={(id) => {
              const next = new URLSearchParams(params)
              if (id) next.set('folder', id)
              else next.delete('folder')
              setParams(next)
            }}
          />
        </Container>

        <Grid gridDefinition={[{ colspan: { default: 12, m: 6 } }, { colspan: { default: 12, m: 6 } }]}>
          <Container header={<Header variant="h2">By file type</Header>}>
            <BarChart
              height={240}
              horizontalBars
              hideFilter
              hideLegend
              statusType={chartStatus(overview)}
              loadingText="Loading storage by type"
              errorText="Couldn't load storage by type."
              xScaleType="categorical"
              series={categories.length ? [{
                title: 'Storage', type: 'bar', color: colorChartsPaletteCategorical1,
                data: categories.map((c) => ({ x: c.category, y: c.bytes })), valueFormatter: (b) => formatBytes(b),
              }] : []}
              detailPopoverSeriesContent={({ y }) => ({ key: 'Storage', value: formatBytes(y) })}
              detailPopoverFooter={(x) => {
                const c = categories.find((k) => k.category === x)
                return c ? <Box fontSize="body-s" color="text-body-secondary">{c.files.toLocaleString()} files</Box> : null
              }}
              yTickFormatter={(b) => formatBytes(b)}
              ariaLabel="Storage used by file type"
              empty={<Box textAlign="center" color="text-body-secondary">No files scanned yet</Box>}
            />
          </Container>
          <Container header={<Header variant="h2">By year created</Header>}>
            <BarChart
              height={240}
              hideFilter
              hideLegend
              statusType={chartStatus(years)}
              loadingText="Loading storage by year"
              errorText="Couldn't load storage by year."
              xScaleType="categorical"
              series={years.data?.length ? [{
                title: 'Storage', type: 'bar', color: colorChartsPaletteCategorical1,
                data: years.data.map((y) => ({ x: String(y.year), y: y.bytes })), valueFormatter: (b) => formatBytes(b),
              }] : []}
              detailPopoverFooter={(x) => {
                const y = years.data?.find((k) => String(k.year) === x)
                return y ? <Box fontSize="body-s" color="text-body-secondary">{y.files.toLocaleString()} files</Box> : null
              }}
              yTickFormatter={(b) => formatBytes(b)}
              ariaLabel="Storage used by the year files were created"
              empty={<Box textAlign="center" color="text-body-secondary">No files scanned yet</Box>}
            />
          </Container>
        </Grid>

        <Table<DriveFileItem>
          trackBy="google_file_id"
          items={largest}
          loading={files.isPending}
          loadingText="Loading largest files"
          header={<Header counter={files.data ? `(${largest.length})` : undefined} description="The single files worth looking at first.">Largest files</Header>}
          columnDefinitions={[
            { id: 'name', header: 'Name', isRowHeader: true, cell: (f) => <Link href={f.web_view_link ?? undefined} external externalIconAriaLabel="(opens in Google Drive)">{f.name}</Link> },
            { id: 'type', header: 'Type', cell: (f) => friendlyType(f.mime_type) },
            { id: 'created', header: 'Created', cell: (f) => formatDate(f.created_time) },
            { id: 'size', header: 'Size', cell: (f) => <SizeBar bytes={f.size ?? 0} max={maxFile} /> },
          ]}
        />
      </SpaceBetween>
    </ContentLayout>
  )
}
