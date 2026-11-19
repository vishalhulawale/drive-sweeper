import Box from '@cloudscape-design/components/box'
import Icon from '@cloudscape-design/components/icon'
import Skeleton from '@cloudscape-design/components/skeleton'
import { colorBackgroundContainerHeader, colorBorderDividerDefault } from '@cloudscape-design/design-tokens'
import { useState, type CSSProperties } from 'react'

/**
 * An image in a fixed-ratio frame: a placeholder while loading, a fade-in when ready, and a
 * "Preview unavailable" tile if it fails. The frame never changes size, so grids don't reflow.
 */
export default function ImageWithPlaceholder({
  src, alt, ratio = '4 / 3', fit = 'contain', style,
}: { src: string; alt: string; ratio?: string; fit?: 'contain' | 'cover'; style?: CSSProperties }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const frame: CSSProperties = {
    position: 'relative', aspectRatio: ratio, width: '100%', overflow: 'hidden', borderRadius: 8,
    background: colorBackgroundContainerHeader, border: `1px solid ${colorBorderDividerDefault}`, ...style,
  }
  return (
    <div style={frame}>
      {state === 'loading' && (
        <div style={{ position: 'absolute', inset: 0 }} aria-hidden>
          <Skeleton width="100%" height="100%" />
        </div>
      )}
      {state === 'error' ? (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          <Box color="text-body-secondary" fontSize="body-s">
            <Icon name="file" /> <br />
            Preview unavailable
          </Box>
        </div>
      ) : (
        <img
          src={src} alt={alt} loading="lazy" decoding="async"
          onLoad={() => setState('ready')} onError={() => setState('error')}
          className="dc-fade-in"
          style={{ width: '100%', height: '100%', objectFit: fit, display: 'block', opacity: state === 'ready' ? 1 : 0 }}
        />
      )}
    </div>
  )
}
