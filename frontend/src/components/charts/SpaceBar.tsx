import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatBytes } from '../../utils/format'

export interface SpacePart {
  key: string
  label: string
  bytes: number
  color: string
  href: string
}

/**
 * A segmented bar: the whole Drive, with the parts that can be freed coloured in.
 * Each part links to its page; hovering a part or its legend row highlights both.
 */
export default function SpaceBar({ parts, total }: { parts: SpacePart[]; total: number }) {
  const [active, setActive] = useState<string | null>(null)
  // Grow from zero once on first render (the app's one automatic animation; off for reduced motion).
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setGrown(true))
    return () => window.cancelAnimationFrame(id)
  }, [])

  const visible = parts.filter((p) => p.bytes > 0)
  const share = (b: number) => (total > 0 ? (b / total) * 100 : 0)
  const describe = (p: SpacePart) => `${p.label}: ${formatBytes(p.bytes)}, ${share(p.bytes).toFixed(1)}% of your Drive`

  return (
    <div>
      <div
        role="img"
        aria-label={`Of ${formatBytes(total)} in your Drive: ${visible.map(describe).join('; ') || 'nothing to free'}.`}
        className="flex h-3 gap-0.5 overflow-hidden"
      >
        {visible.map((p) => (
          <Link
            key={p.key}
            to={p.href}
            tabIndex={-1}
            title={describe(p)}
            onMouseEnter={() => setActive(p.key)}
            onMouseLeave={() => setActive(null)}
            className="dc-grow shrink-0"
            style={{ width: grown ? `max(6px, ${share(p.bytes)}%)` : 0, background: p.color, opacity: active && active !== p.key ? 0.35 : 1 }}
          />
        ))}
        {/* The rest of the Drive. */}
        <div className="min-w-1.5 flex-1 bg-slate-100 dark:bg-slate-800" />
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {parts.map((p) => (
          <li key={p.key}>
            <Link
              to={p.href}
              onMouseEnter={() => setActive(p.key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(p.key)}
              onBlur={() => setActive(null)}
              className="group inline-flex items-center gap-2"
              style={{ opacity: active && active !== p.key ? 0.55 : 1 }}
            >
              <span aria-hidden className="h-2.5 w-2.5 shrink-0" style={{ background: p.color }} />
              <span className="text-slate-600 group-hover:underline dark:text-slate-400">{p.label}</span>
              <span className="font-semibold" data-numeric>{formatBytes(p.bytes)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
