import Box from '@cloudscape-design/components/box'
import PieChart from '@cloudscape-design/components/pie-chart'
import type { CategoryUsage } from '../../types/analytics'
import { formatBytes } from '../../utils/format'
import { AppLink } from '../common/RouterLink'

const MAX_SLICES = 6

interface Slice {
  title: string
  value: number
  files: number
}

/** Top categories by size, the rest folded into "Other" so colours stay in fixed order. */
function toSlices(categories: CategoryUsage[]): Slice[] {
  const sorted = [...categories].filter((c) => c.bytes > 0).sort((a, b) => b.bytes - a.bytes)
  const head = sorted.slice(0, MAX_SLICES).map((c) => ({ title: c.category, value: c.bytes, files: c.files }))
  const tail = sorted.slice(MAX_SLICES)
  if (tail.length) {
    head.push({
      title: 'Other',
      value: tail.reduce((s, c) => s + c.bytes, 0),
      files: tail.reduce((s, c) => s + c.files, 0),
    })
  }
  return head
}

export default function TypeDonut({
  categories, total, status, onRetry, size = 'medium',
}: {
  categories: CategoryUsage[] | undefined
  total: number | undefined
  status: 'loading' | 'finished' | 'error'
  onRetry?: () => void
  size?: 'small' | 'medium' | 'large'
}) {
  const data = toSlices(categories ?? [])
  return (
    <PieChart
      variant="donut"
      size={size}
      data={data}
      statusType={status}
      loadingText="Loading storage by type"
      errorText="Couldn't load storage by type."
      recoveryText="Retry"
      onRecoveryClick={onRetry}
      hideFilter
      innerMetricValue={total !== undefined ? formatBytes(total) : undefined}
      innerMetricDescription="used by files"
      legendTitle="File type"
      ariaLabel="Storage used by file type"
      ariaDescription="Donut chart of storage used by each file type."
      segmentDescription={(d, sum) => `${formatBytes(d.value)}, ${((d.value / sum) * 100).toFixed(0)}%`}
      detailPopoverContent={(d, sum) => [
        { key: 'Size', value: formatBytes(d.value) },
        { key: 'Share', value: `${((d.value / sum) * 100).toFixed(1)}%` },
        { key: 'Files', value: d.files.toLocaleString() },
      ]}
      detailPopoverFooter={() => <AppLink href="/analytics">Open storage analytics</AppLink>}
      empty={<Box textAlign="center" color="inherit">No files scanned yet</Box>}
      i18nStrings={{
        detailsValue: 'Size', detailsPercentage: 'Share', filterLabel: 'Filter displayed data',
        filterPlaceholder: 'Filter data', filterSelectedAriaLabel: 'selected', detailPopoverDismissAriaLabel: 'Dismiss',
        legendAriaLabel: 'Legend', chartAriaRoleDescription: 'donut chart', segmentAriaRoleDescription: 'segment',
      }}
    />
  )
}
