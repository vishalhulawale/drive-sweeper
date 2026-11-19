import BarChart from '@cloudscape-design/components/bar-chart'
import Box from '@cloudscape-design/components/box'
import { colorChartsPaletteCategorical3 } from '@cloudscape-design/design-tokens'
import type { TrashItem } from '../../types/trash'
import { formatBytes } from '../../utils/format'

const DAYS = 30

interface Day {
  x: string
  y: number
  files: string[]
}

function dayKey(d: Date) {
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** Bytes Drive will delete on each of the next 30 days (from the items deleting soonest). */
function bucket(items: TrashItem[]): Day[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days: Day[] = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    return { x: dayKey(d), y: 0, files: [] }
  })
  for (const it of items) {
    if (!it.auto_deletes_at) continue
    const d = new Date(it.auto_deletes_at)
    d.setHours(0, 0, 0, 0)
    const i = Math.max(0, Math.round((d.getTime() - today.getTime()) / 86_400_000))
    if (i >= DAYS) continue
    days[i].y += it.file.size ?? 0
    days[i].files.push(it.file.name)
  }
  return days
}

export default function TrashTimeline({
  items, status, onRetry,
}: { items: TrashItem[] | undefined; status: 'loading' | 'finished' | 'error'; onRetry: () => void }) {
  const days = bucket(items ?? [])
  const any = days.some((d) => d.y > 0)
  const byX = new Map(days.map((d) => [d.x, d]))

  return (
    <BarChart
      height={180}
      hideFilter
      hideLegend
      statusType={status}
      loadingText="Loading deletion dates"
      errorText="Couldn't load deletion dates."
      recoveryText="Retry"
      onRecoveryClick={onRetry}
      xScaleType="categorical"
      xDomain={days.map((d) => d.x)}
      series={any ? [{
        title: 'Deleted by Drive', type: 'bar', color: colorChartsPaletteCategorical3,
        data: days.map((d) => ({ x: d.x, y: d.y })), valueFormatter: (v) => formatBytes(v),
      }] : []}
      xTitle="Day"
      yTitle="Space freed"
      yTickFormatter={(v) => formatBytes(v)}
      xTickFormatter={(x) => {
        const i = days.findIndex((d) => d.x === x)
        return i % 5 === 0 ? String(x) : ''
      }}
      detailPopoverFooter={(x) => {
        const d = byX.get(String(x))
        if (!d?.files.length) return null
        return (
          <Box fontSize="body-s" color="text-body-secondary">
            {d.files.slice(0, 5).join(', ')}{d.files.length > 5 ? ` and ${d.files.length - 5} more` : ''}
          </Box>
        )
      }}
      ariaLabel="Space Drive frees by deleting Trash items, per day for the next 30 days"
      empty={<Box textAlign="center" color="text-body-secondary">Nothing is due to be deleted in the next 30 days.</Box>}
    />
  )
}
