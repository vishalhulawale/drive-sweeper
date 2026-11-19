import { ImageOff } from 'lucide-react'
import { useState } from 'react'
import { cx } from '../ui/core'

/**
 * An image in a fixed-ratio frame: a placeholder while loading, a fade-in when ready, and a
 * "Preview unavailable" tile if it fails. The frame never changes size, so grids don't reflow.
 */
export default function ImageWithPlaceholder({
  src, alt, ratio = '4 / 3', fit = 'contain', bordered = true,
}: { src: string; alt: string; ratio?: string; fit?: 'contain' | 'cover'; bordered?: boolean }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  return (
    <div className={cx('relative w-full overflow-hidden bg-[#fafafa] dark:bg-slate-800/60', bordered && 'border border-line dark:border-slate-700')} style={{ aspectRatio: ratio }}>
      {state === 'loading' && <div className="absolute inset-0 animate-pulse bg-slate-100 dark:bg-slate-800" aria-hidden />}
      {state === 'error' ? (
        <div className="absolute inset-0 grid place-items-center text-center text-xs text-slate-500">
          <span><ImageOff size={18} className="mx-auto mb-1" aria-hidden />Preview unavailable</span>
        </div>
      ) : (
        <img
          src={src} alt={alt} loading="lazy" decoding="async"
          onLoad={() => setState('ready')} onError={() => setState('error')}
          className="dc-fade-in block h-full w-full"
          style={{ objectFit: fit, opacity: state === 'ready' ? 1 : 0 }}
        />
      )}
    </div>
  )
}
