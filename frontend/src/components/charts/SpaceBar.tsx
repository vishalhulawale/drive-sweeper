import Box from '@cloudscape-design/components/box'
import { colorBorderDividerDefault, colorBorderItemFocused } from '@cloudscape-design/design-tokens'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatBytes } from '../../utils/format'

export interface SpacePart {
  key: string
  label: string
  bytes: number
  color: string
  href: string
}

/**
 * A thin segmented bar: the whole Drive, with the parts that can be freed coloured in.
 * Each part is a focusable link; hovering a part or its legend row highlights both.
 */
export default function SpaceBar({ parts, total }: { parts: SpacePart[]; total: number }) {
  const navigate = useNavigate()
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
        style={{
          display: 'flex', gap: 2, height: 8, borderRadius: 4, overflow: 'hidden',
        }}
      >
        {visible.map((p) => (
          <div
            key={p.key}
            title={describe(p)}
            onMouseEnter={() => setActive(p.key)}
            onMouseLeave={() => setActive(null)}
            onClick={() => navigate(p.href)}
            className="dc-grow"
            style={{
              width: grown ? `max(6px, ${share(p.bytes)}%)` : 0,
              flexShrink: 0, background: p.color, cursor: 'pointer',
              opacity: active && active !== p.key ? 0.35 : 1,
            }}
          />
        ))}
        {/* The rest of the Drive; the 2px gaps show the surface between parts. */}
        <div style={{ flex: 1, minWidth: 6, background: colorBorderDividerDefault }} />
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'flex', flexWrap: 'wrap', gap: '8px 24px' }}>
        {parts.map((p) => (
          <li key={p.key}>
            <a
              href={p.href}
              onClick={(e) => { e.preventDefault(); navigate(p.href) }}
              onMouseEnter={() => setActive(p.key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(p.key)}
              onBlur={() => setActive(null)}
              className="dc-legend-link"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'inherit',
                borderRadius: 4, padding: '2px 4px', margin: '-2px -4px',
                outlineColor: colorBorderItemFocused,
                opacity: active && active !== p.key ? 0.55 : 1,
              }}
            >
              <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: p.color, flexShrink: 0 }} />
              <Box variant="span" color="text-body-secondary">{p.label}</Box>
              <Box variant="span" fontWeight="bold">{formatBytes(p.bytes)}</Box>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
