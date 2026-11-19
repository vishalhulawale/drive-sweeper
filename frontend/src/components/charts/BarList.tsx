import type { ReactNode } from 'react'
import { Button, Skeleton } from '../ui/core'

/**
 * Horizontal bars as a labelled list (SAP-C03's "domains by weight" look): name, bar, value.
 * Reads as a table for screen readers and never needs a tooltip.
 */
export default function BarList({
  rows, format, status = 'finished', onRetry, empty,
}: {
  rows: { label: ReactNode; value: number; detail?: ReactNode; key: string }[]
  format: (v: number) => string
  status?: 'loading' | 'finished' | 'error'
  onRetry?: () => void
  empty?: ReactNode
}) {
  if (status === 'loading') return <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-5" />)}</div>
  if (status === 'error') return <p className="py-6 text-sm text-rose-600">Couldn&apos;t load this chart. {onRetry && <Button variant="link" onClick={onRetry}>Retry</Button>}</p>
  const max = Math.max(0, ...rows.map((r) => r.value))
  if (!max) return <p className="py-8 text-center text-sm text-slate-500">{empty ?? 'Nothing to show yet'}</p>
  return (
    <ul className="space-y-2.5 text-sm">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate font-medium">{r.label}</span>
            <span className="shrink-0">
              {r.detail && <span className="mr-2 text-xs text-slate-500">{r.detail}</span>}
              <span className="font-semibold" data-numeric>{format(r.value)}</span>
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden bg-slate-100 dark:bg-slate-800">
            <div className="h-full bg-brand-500" style={{ width: `${Math.max(1, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
