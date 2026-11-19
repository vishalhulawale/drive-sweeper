import { ChevronDown, EllipsisVertical, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button, cx } from './core'

const MODAL_WIDTH = { medium: 'max-w-lg', large: 'max-w-3xl', max: 'max-w-7xl' } as const

/** A dialog over a dimmed page. Escape or the backdrop closes it; focus moves inside and returns afterwards. */
export function Modal({
  visible, onDismiss, header, footer, children, size = 'medium',
}: { visible: boolean; onDismiss: () => void; header: ReactNode; footer?: ReactNode; children: ReactNode; size?: keyof typeof MODAL_WIDTH }) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useEffect(() => {
    if (!visible) return
    const before = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onDismiss() } }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      before?.focus?.()
    }
  }, [visible, onDismiss])
  if (!visible) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div className="fixed inset-0 bg-black/40" onClick={onDismiss} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx('relative mt-[6vh] w-full border border-line bg-white text-ink shadow-lg outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200', MODAL_WIDTH[size])}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-3 dark:border-slate-700">
          <h2 id={titleId} className="text-lg font-bold">{header}</h2>
          <button onClick={onDismiss} aria-label="Close" className="-mr-2 p-1 text-slate-500 hover:text-ink dark:hover:text-white"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 text-sm leading-relaxed">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3 dark:border-slate-700">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/** Opens a small panel under its trigger; a click outside or Escape closes it. */
function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open, close])
  return ref
}

export interface MenuItem { id: string; text: ReactNode; description?: ReactNode; disabled?: boolean }

/** A button that opens a list of actions. `icon` gives a three-dot trigger instead of a labelled one. */
export function Dropdown({
  label, items, onItemClick, disabled, loading, icon, ariaLabel, align = 'right',
}: {
  label?: ReactNode
  items: MenuItem[]
  onItemClick: (id: string) => void
  disabled?: boolean
  loading?: boolean
  icon?: boolean
  ariaLabel?: string
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const ref = useOutsideClose(open, () => setOpen(false))
  return (
    <div ref={ref} className="relative">
      {icon ? (
        <Button variant="icon" ariaLabel={ariaLabel} disabled={disabled} onClick={() => setOpen(!open)}><EllipsisVertical size={16} /></Button>
      ) : (
        <Button disabled={disabled} loading={loading} onClick={() => setOpen(!open)} iconRight={<ChevronDown size={14} />} ariaLabel={ariaLabel}>{label}</Button>
      )}
      {open && (
        <ul role="menu" className={cx('absolute z-40 mt-1 min-w-56 border border-line bg-white py-1 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900', align === 'right' ? 'right-0' : 'left-0')}>
          {items.map((it) => (
            <li key={it.id} role="none">
              <button
                role="menuitem"
                disabled={it.disabled}
                onClick={() => { setOpen(false); onItemClick(it.id) }}
                className="block w-full px-3 py-1.5 text-left hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-slate-800"
              >
                <span className="block">{it.text}</span>
                {it.description && <span className="block text-xs text-slate-500">{it.description}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Click a trigger to show a small explanation panel. */
export function Popover({ trigger, header, children, ariaLabel }: { trigger: ReactNode; header?: ReactNode; children: ReactNode; ariaLabel?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useOutsideClose(open, () => setOpen(false))
  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={ariaLabel} className="hover:underline">{trigger}</button>
      {open && (
        <div className="absolute left-0 z-40 mt-1 w-72 border border-line bg-white p-3 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {header && <p className="mb-1 font-semibold">{header}</p>}
          {children}
        </div>
      )}
    </div>
  )
}
