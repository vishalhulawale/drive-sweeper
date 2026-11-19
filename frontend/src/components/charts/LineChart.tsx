import { useRef, useState, type ReactNode } from 'react'

export interface Point {
  x: Date
  y: number
  detail?: ReactNode
}

const W = 800
const PAD = { l: 8, r: 8, t: 10, b: 4 }

/** A single-series line over time. The nearest point to the pointer is read out above the chart. */
export default function LineChart({
  points, height = 200, formatX, formatY, ariaLabel,
}: { points: Point[]; height?: number; formatX: (d: Date) => string; formatY: (v: number) => string; ariaLabel: string }) {
  const svg = useRef<SVGSVGElement>(null)
  const [active, setActive] = useState<number | null>(null)
  const xs = points.map((p) => p.x.getTime())
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const maxY = Math.max(1, ...points.map((p) => p.y))
  const minY = Math.min(...points.map((p) => p.y))
  const lo = Math.max(0, minY - (maxY - minY) * 0.15)
  const H = height
  const px = (t: number) => PAD.l + (maxX === minX ? 0.5 : (t - minX) / (maxX - minX)) * (W - PAD.l - PAD.r)
  const py = (v: number) => PAD.t + (1 - (v - lo) / (maxY - lo || 1)) * (H - PAD.t - PAD.b)
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${px(p.x.getTime()).toFixed(1)},${py(p.y).toFixed(1)}`).join(' ')
  const area = `${line} L${px(maxX)},${H - PAD.b} L${px(minX)},${H - PAD.b} Z`

  const onMove = (e: React.PointerEvent) => {
    const r = svg.current?.getBoundingClientRect()
    if (!r) return
    const x = ((e.clientX - r.left) / r.width) * W
    let best = 0
    points.forEach((p, i) => { if (Math.abs(px(p.x.getTime()) - x) < Math.abs(px(points[best].x.getTime()) - x)) best = i })
    setActive(best)
  }
  const shown = active !== null ? points[active] : points[points.length - 1]

  return (
    <div>
      <div className="mb-2 h-10 text-sm" aria-live="polite">
        <span className="font-semibold">{formatX(shown.x)}</span>: <span data-numeric>{formatY(shown.y)}</span>
        {shown.detail && <div className="text-xs text-slate-500">{shown.detail}</div>}
      </div>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between text-right text-[11px] text-slate-500" style={{ height }} aria-hidden>
          <span data-numeric>{formatY(maxY)}</span>
          <span data-numeric>{formatY(lo)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <svg
            ref={svg}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="block w-full border-b border-slate-300 dark:border-slate-600"
            style={{ height }}
            role="img"
            aria-label={ariaLabel}
            onPointerMove={onMove}
            onPointerLeave={() => setActive(null)}
          >
            <line x1={0} x2={W} y1={py(maxY)} y2={py(maxY)} className="stroke-line dark:stroke-slate-700" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            <path d={area} fill="var(--color-chart-1)" opacity={0.12} />
            <path d={line} fill="none" stroke="var(--color-chart-1)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            {active !== null && (
              <line x1={px(shown.x.getTime())} x2={px(shown.x.getTime())} y1={0} y2={H} className="stroke-slate-400" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            )}
          </svg>
          <div className="mt-1 flex justify-between text-[11px] text-slate-500" aria-hidden>
            <span>{formatX(points[0].x)}</span>
            <span>{formatX(points[points.length - 1].x)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
