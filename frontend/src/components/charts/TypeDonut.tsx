import { useState } from 'react'
import type { CategoryUsage } from '../../types/analytics'
import { formatBytes } from '../../utils/format'
import { Button, Skeleton } from '../ui/core'
import { REST, SERIES } from './palette'

const MAX_SLICES = 6

interface Slice {
  title: string
  value: number
  files: number
  color: string
}

/** Top categories by size, the rest folded into "Other" so colours stay in fixed order. */
function toSlices(categories: CategoryUsage[]): Slice[] {
  const sorted = [...categories].filter((c) => c.bytes > 0).sort((a, b) => b.bytes - a.bytes)
  const head: Slice[] = sorted.slice(0, MAX_SLICES).map((c, i) => ({ title: c.category, value: c.bytes, files: c.files, color: SERIES[i] }))
  const tail = sorted.slice(MAX_SLICES)
  if (tail.length) {
    head.push({ title: 'Other', value: tail.reduce((s, c) => s + c.bytes, 0), files: tail.reduce((s, c) => s + c.files, 0), color: REST })
  }
  return head
}

const R = 42
const C = 2 * Math.PI * R

/** Storage by file type: a donut with the total in the middle, and a legend that doubles as the data table. */
export default function TypeDonut({
  categories, total, status, onRetry,
}: {
  categories: CategoryUsage[] | undefined
  total: number | undefined
  status: 'loading' | 'finished' | 'error'
  onRetry?: () => void
}) {
  const [active, setActive] = useState<string | null>(null)
  if (status === 'loading') {
    return <div className="flex items-center gap-6"><Skeleton className="h-36 w-36 rounded-full" /><div className="flex-1 space-y-2"><Skeleton /><Skeleton /><Skeleton className="h-4 w-2/3" /></div></div>
  }
  if (status === 'error') {
    return <p className="text-sm text-rose-600">Couldn&apos;t load storage by type. {onRetry && <Button variant="link" onClick={onRetry}>Retry</Button>}</p>
  }
  const data = toSlices(categories ?? [])
  const sum = data.reduce((s, d) => s + d.value, 0)
  if (!sum) return <p className="py-6 text-center text-sm text-slate-500">No files scanned yet</p>

  const offsets = data.map((_, i) => data.slice(0, i).reduce((s, d) => s + (d.value / sum) * C, 0))
  const shown = data.find((d) => d.title === active)

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label={`Storage used by file type: ${data.map((d) => `${d.title} ${formatBytes(d.value)}`).join(', ')}`}>
          {data.map((d, i) => {
            const len = (d.value / sum) * C
            return (
              <circle
                key={d.title}
                cx="50" cy="50" r={R} fill="none" stroke={d.color} strokeWidth="14"
                strokeDasharray={`${Math.max(0, len - 0.6)} ${C}`} strokeDashoffset={-offsets[i]}
                opacity={active && active !== d.title ? 0.3 : 1}
                onMouseEnter={() => setActive(d.title)} onMouseLeave={() => setActive(null)}
                className="cursor-default transition-opacity"
              />
            )
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-base font-bold leading-tight" data-numeric>{formatBytes(shown ? shown.value : total ?? sum)}</div>
            <div className="text-[11px] text-slate-500">{shown ? shown.title : 'used by files'}</div>
          </div>
        </div>
      </div>
      <ul className="min-w-48 flex-1 text-sm">
        {data.map((d) => (
          <li
            key={d.title}
            onMouseEnter={() => setActive(d.title)}
            onMouseLeave={() => setActive(null)}
            className="flex items-center gap-2 py-0.5"
            style={{ opacity: active && active !== d.title ? 0.5 : 1 }}
          >
            <span aria-hidden className="h-2.5 w-2.5 shrink-0" style={{ background: d.color }} />
            <span className="flex-1 truncate">{d.title}</span>
            <span className="text-slate-500" data-numeric>{((d.value / sum) * 100).toFixed(0)}%</span>
            <span className="w-20 text-right font-semibold" data-numeric>{formatBytes(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
