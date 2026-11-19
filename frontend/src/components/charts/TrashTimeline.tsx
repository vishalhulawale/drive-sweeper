import type { TrashItem } from '../../types/trash'
import { formatBytes } from '../../utils/format'
import ColumnChart, { type Column } from './ColumnChart'

const DAYS = 30

function dayKey(d: Date) {
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** Bytes Drive will delete on each of the next 30 days (from the items deleting soonest). */
function bucket(items: TrashItem[]): Column[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    return { x: dayKey(d), y: 0, files: [] as string[] }
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
  return days.map((d) => ({
    x: d.x,
    y: d.y,
    detail: d.files.length ? `${d.files.slice(0, 5).join(', ')}${d.files.length > 5 ? ` and ${d.files.length - 5} more` : ''}` : undefined,
  }))
}

export default function TrashTimeline({
  items, status, onRetry,
}: { items: TrashItem[] | undefined; status: 'loading' | 'finished' | 'error'; onRetry: () => void }) {
  return (
    <ColumnChart
      data={bucket(items ?? [])}
      format={formatBytes}
      status={status}
      onRetry={onRetry}
      height={180}
      tickEvery={5}
      color="var(--color-chart-3)"
      ariaLabel="Space Drive frees by deleting Trash items, per day for the next 30 days"
      empty="Nothing is due to be deleted in the next 30 days."
    />
  )
}
