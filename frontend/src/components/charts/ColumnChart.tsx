import { useState, type ReactNode } from 'react'
import { Button, Skeleton } from '../ui/core'

export interface Column {
  x: string
  y: number
  detail?: ReactNode
}

/**
 * Vertical columns with a light grid. Hovering or focusing a column shows its value and detail above the chart,
 * so nothing covers the bars. `tickEvery` thins the x labels on long ranges.
 */
export default function ColumnChart({
  data, format, status = 'finished', onRetry, height = 200, tickEvery = 1, color = 'var(--color-chart-1)', empty, ariaLabel,
}: {
  data: Column[]
  format: (v: number) => string
  status?: 'loading' | 'finished' | 'error'
  onRetry?: () => void
  height?: number
  tickEvery?: number
  color?: string
  empty?: ReactNode
  ariaLabel: string
}) {
  const [active, setActive] = useState<number | null>(null)
  if (status === 'loading') return <Skeleton style={{ height }} className="w-full" />
  if (status === 'error') {
    return <p className="py-6 text-sm text-rose-600">Couldn&apos;t load this chart. {onRetry && <Button variant="link" onClick={onRetry}>Retry</Button>}</p>
  }
  const max = Math.max(0, ...data.map((d) => d.y))
  if (!max) return <p className="py-8 text-center text-sm text-slate-500">{empty ?? 'Nothing to show yet'}</p>

  const shown = active !== null ? data[active] : null
  const ticks = [1, 0.5, 0]

  return (
    <div>
      <div className="mb-2 h-10 text-sm" aria-live="polite">
        {shown ? (
          <>
            <span className="font-semibold">{shown.x}</span>: <span data-numeric>{format(shown.y)}</span>
            {shown.detail && <div className="truncate text-xs text-slate-500">{shown.detail}</div>}
          </>
        ) : (
          <span className="text-xs text-slate-400">Point at a column for details</span>
        )}
      </div>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between pb-5 text-right text-[11px] text-slate-500" style={{ height }} aria-hidden>
          {ticks.map((t) => <span key={t} data-numeric>{format(max * t)}</span>)}
        </div>
        <div className="min-w-0 flex-1">
          <div role="list" aria-label={ariaLabel} className="relative flex items-end gap-[2px] border-b border-slate-300 dark:border-slate-600" style={{ height: height - 20 }}>
            {ticks.slice(0, 2).map((t) => (
              <div key={t} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line dark:border-slate-700" style={{ bottom: `${t * 100}%` }} aria-hidden />
            ))}
            {data.map((d, i) => (
              <div
                key={d.x}
                role="listitem"
                tabIndex={0}
                aria-label={`${d.x}: ${format(d.y)}`}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="relative flex h-full flex-1 items-end outline-none focus-visible:bg-brand-50 dark:focus-visible:bg-brand-600/10"
              >
                <div
                  className="w-full transition-opacity"
                  style={{ height: d.y ? `max(2px, ${(d.y / max) * 100}%)` : 0, background: color, opacity: active !== null && active !== i ? 0.45 : 1 }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-[2px] text-[11px] text-slate-500" aria-hidden>
            {data.map((d, i) => (
              <span key={d.x} className="flex-1 overflow-visible whitespace-nowrap text-center">{i % tickEvery === 0 ? d.x : ''}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
