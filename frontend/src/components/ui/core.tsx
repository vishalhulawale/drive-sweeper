import {
  CircleCheck, CircleMinus, CircleX, Clock, ExternalLink, Info, LoaderCircle, Search, TriangleAlert, X,
} from 'lucide-react'
import { useId, type CSSProperties, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router-dom'

/*
 * DriveClean's UI kit, in SAP-C03 Prep's visual language: square corners, 1px borders in --color-line, bold dark
 * headings, Cloudscape blue for links and primary actions. Everything here is plain Tailwind.
 */

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

// ---------- buttons and links ----------

export type ButtonVariant = 'normal' | 'primary' | 'link' | 'icon'

const BUTTON: Record<ButtonVariant, string> = {
  normal:
    'border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-ink hover:border-brand-500 hover:text-brand-600 ' +
    'dark:border-slate-600 dark:bg-transparent dark:text-slate-200 dark:hover:border-brand-500 dark:hover:text-brand-500',
  primary:
    'border border-brand-600 bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:border-brand-900 hover:bg-brand-900 ' +
    'dark:border-brand-500 dark:bg-brand-500 dark:text-squid-dark dark:hover:bg-brand-100',
  link: 'p-0 text-brand-600 hover:underline dark:text-brand-500',
  icon: 'p-1.5 text-slate-500 hover:bg-slate-100 hover:text-ink dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white',
}

export interface ButtonProps {
  children?: ReactNode
  variant?: ButtonVariant
  onClick?: () => void
  disabled?: boolean
  loading?: boolean
  /** An in-app route (client-side navigation). */
  to?: string
  /** A full address (a page reload); `newTab` opens it in a new tab with the external icon. */
  href?: string
  newTab?: boolean
  icon?: ReactNode
  iconRight?: ReactNode
  ariaLabel?: string
  title?: string
  type?: 'button' | 'submit'
  className?: string
}

export function Button({
  children, variant = 'normal', onClick, disabled, loading, to, href, newTab, icon, iconRight, ariaLabel, title, type = 'button', className,
}: ButtonProps) {
  const off = disabled || loading
  const cls = cx(
    'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap transition-colors',
    BUTTON[variant],
    off && 'pointer-events-none opacity-50',
    className,
  )
  const body = (
    <>
      {loading ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : icon}
      {children}
      {iconRight}
    </>
  )
  if (to && !off) return <RouterLink to={to} className={cls} aria-label={ariaLabel} title={title}>{body}</RouterLink>
  if (href && !off) {
    return newTab
      ? <a href={href} target="_blank" rel="noreferrer" className={cls} aria-label={ariaLabel} title={title}>{body}<ExternalLink size={13} aria-label="(opens in a new tab)" /></a>
      : <a href={href} className={cls} aria-label={ariaLabel} title={title}>{body}</a>
  }
  return (
    <button type={type} onClick={onClick} disabled={off} aria-label={ariaLabel} title={title} aria-busy={loading || undefined} className={cls}>
      {body}
    </button>
  )
}

/** A blue text link to an in-app route. */
export function AppLink({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return <RouterLink to={to} className={cx('text-brand-600 hover:underline dark:text-brand-500', className)}>{children}</RouterLink>
}

/** A link that opens in Google Drive (new tab), with the external icon. */
export function ExternalAnchor({ href, children, className, label }: { href?: string | null; children: ReactNode; className?: string; label?: string }) {
  if (!href) return <span className={className}>{children}</span>
  return (
    <a href={href} target="_blank" rel="noreferrer" aria-label={label} className={cx('text-brand-600 hover:underline dark:text-brand-500', className)}>
      {children}
      <ExternalLink size={12} className="ml-1 inline-block align-[-1px] opacity-70" aria-label="(opens in a new tab)" />
    </a>
  )
}

// ---------- page structure ----------

/** The page title block: h1, optional count, description and actions. */
export function PageHeader({
  title, counter, info, description, actions,
}: { title: ReactNode; counter?: ReactNode; info?: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1 basis-96">
        <h1 className="text-3xl font-bold tracking-tight">
          {title}
          {counter != null && <span className="ml-2 text-xl font-normal text-slate-500">{counter}</span>}
          {info && <span className="ml-3 align-middle text-sm font-normal tracking-normal">{info}</span>}
        </h1>
        {description && <p className="mt-2 max-w-3xl text-slate-600 dark:text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

/** A bordered section with a header row. `flush` drops the body padding (for tables). */
export function Panel({
  title, counter, info, description, actions, children, flush, className, footer,
}: {
  title?: ReactNode
  counter?: ReactNode
  info?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  flush?: boolean
  className?: string
  footer?: ReactNode
}) {
  const hasHeader = title != null || actions != null
  return (
    <section className={cx('border border-line bg-white dark:border-slate-700 dark:bg-squid-dark', className)}>
      {hasHeader && (
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3 dark:border-slate-700">
          <div className="min-w-0 flex-1 basis-64">
            {title != null && (
              <h2 className="text-base font-bold">
                {title}
                {counter != null && <span className="ml-1.5 font-normal text-slate-500">{counter}</span>}
                {info && <span className="ml-2 text-sm font-normal">{info}</span>}
              </h2>
            )}
            {description && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={flush ? undefined : 'p-4'}>{children}</div>
      {footer && <div className="border-t border-line px-4 py-2 dark:border-slate-700">{footer}</div>}
    </section>
  )
}

/** Vertical rhythm between page sections. */
export function Stack({ children, gap = 'md', className }: { children: ReactNode; gap?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  const g = { xs: 'gap-1', sm: 'gap-2', md: 'gap-4', lg: 'gap-6' }[gap]
  return <div className={cx('flex flex-col', g, className)}>{children}</div>
}

export function Row({ children, gap = 'sm', className }: { children: ReactNode; gap?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  const g = { xs: 'gap-1', sm: 'gap-2', md: 'gap-4', lg: 'gap-6' }[gap]
  return <div className={cx('flex flex-wrap items-center', g, className)}>{children}</div>
}

// ---------- values ----------

const KV_COLS = { 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' } as const

/** Label above value, SAP-C03 fact style: small uppercase label, value below. */
export function KeyValues({ items, columns = 2 }: { items: { label: ReactNode; value: ReactNode; info?: ReactNode }[]; columns?: 1 | 2 | 3 | 4 }) {
  return (
    <dl className={cx('grid gap-x-6 gap-y-4', KV_COLS[columns])}>
      {items.map((it, i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {it.label}
            {it.info && <span className="ml-2 font-normal normal-case tracking-normal">{it.info}</span>}
          </dt>
          <dd className="mt-1 break-words">{it.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Bordered fact tiles in a row, like the SAP-C03 dashboard's exam facts. */
export function StatTiles({ items }: { items: { label: ReactNode; value: ReactNode; detail?: ReactNode }[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((it, i) => (
        <div key={i} className="border border-line p-4 dark:border-slate-700">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{it.label}</div>
          <div className="mt-1 text-lg font-semibold" data-numeric>{it.value}</div>
          {it.detail && <div className="mt-0.5 text-sm text-slate-500">{it.detail}</div>}
        </div>
      ))}
    </div>
  )
}

export type BadgeColor = 'grey' | 'blue' | 'green' | 'amber' | 'red' | 'violet'
const BADGE: Record<BadgeColor, string> = {
  grey: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  blue: 'bg-brand-100 text-brand-700 dark:bg-brand-600/20 dark:text-brand-500',
  green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  red: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
}

export function Badge({ children, color = 'grey', className }: { children: ReactNode; color?: BadgeColor; className?: string }) {
  return <span className={cx('inline-block whitespace-nowrap px-1.5 py-0.5 text-[11px] font-semibold leading-none', BADGE[color], className)}>{children}</span>
}

export type StatusType = 'success' | 'error' | 'warning' | 'info' | 'pending' | 'in-progress' | 'stopped'
const STATUS: Record<StatusType, [typeof Info, string]> = {
  success: [CircleCheck, 'text-emerald-600 dark:text-emerald-400'],
  error: [CircleX, 'text-rose-600 dark:text-rose-400'],
  warning: [TriangleAlert, 'text-amber-600 dark:text-amber-400'],
  info: [Info, 'text-brand-600 dark:text-brand-500'],
  pending: [Clock, 'text-slate-500'],
  'in-progress': [LoaderCircle, 'text-brand-600 dark:text-brand-500'],
  stopped: [CircleMinus, 'text-slate-500'],
}

/** An icon and a short phrase, coloured by meaning. */
export function Status({ type, children }: { type: StatusType; children: ReactNode }) {
  const [Icon, color] = STATUS[type]
  return (
    <span className={cx('inline-flex items-center gap-1.5', type === 'error' ? color : undefined)}>
      <Icon size={15} className={cx('shrink-0', color, type === 'in-progress' && 'animate-spin')} aria-hidden />
      <span>{children}</span>
    </span>
  )
}

export function Secondary({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('text-sm text-slate-500 dark:text-slate-400', className)}>{children}</span>
}

// ---------- feedback ----------

export type AlertType = 'info' | 'success' | 'warning' | 'error' | 'in-progress'
const ALERT: Record<AlertType, [typeof Info, string, string]> = {
  info: [Info, 'border-brand-100 bg-brand-50 dark:border-brand-600/40 dark:bg-brand-600/10', 'text-brand-600 dark:text-brand-500'],
  'in-progress': [LoaderCircle, 'border-brand-100 bg-brand-50 dark:border-brand-600/40 dark:bg-brand-600/10', 'text-brand-600 dark:text-brand-500 animate-spin'],
  success: [CircleCheck, 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40', 'text-emerald-600 dark:text-emerald-400'],
  warning: [TriangleAlert, 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40', 'text-amber-600 dark:text-amber-400'],
  error: [CircleX, 'border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40', 'text-rose-600 dark:text-rose-400'],
}

export function Alert({
  type = 'info', header, children, action, onDismiss,
}: { type?: AlertType; header?: ReactNode; children?: ReactNode; action?: ReactNode; onDismiss?: () => void }) {
  const [Icon, box, icon] = ALERT[type]
  return (
    <div role={type === 'error' ? 'alert' : 'status'} className={cx('flex flex-wrap items-start gap-3 border px-4 py-3 text-sm', box)}>
      <Icon size={18} className={cx('mt-0.5 shrink-0', icon)} aria-hidden />
      <div className="min-w-0 flex-1 basis-60">
        {header && <p className="font-semibold">{header}</p>}
        {children && <div className={header ? 'mt-0.5' : undefined}>{children}</div>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss" className="-mr-1 p-1 text-slate-500 hover:text-ink dark:hover:text-white">
          <X size={16} />
        </button>
      )}
    </div>
  )
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return <LoaderCircle size={size} className={cx('animate-spin text-slate-400', className)} aria-hidden />
}

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden style={style} className={cx('animate-pulse bg-slate-100 dark:bg-slate-800', className ?? 'h-4 w-full')} />
}

/** Progress, SAP-C03 style: a thin flat bar. Without a value it pulses (unknown total). */
export function ProgressBar({ value, label, description, info }: { value?: number; label?: ReactNode; description?: ReactNode; info?: ReactNode }) {
  const known = value !== undefined && Number.isFinite(value)
  return (
    <div>
      {(label || known) && (
        <div className="flex justify-between gap-4 text-sm">
          <span className="font-semibold">{label}</span>
          {known && <span className="text-slate-500" data-numeric>{Math.round(value)}%</span>}
        </div>
      )}
      <div
        className="mt-2 h-2 overflow-hidden bg-slate-100 dark:bg-slate-800"
        role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={known ? Math.round(value) : undefined}
      >
        <div className={cx('h-full bg-brand-600 transition-all dark:bg-brand-500', !known && 'w-1/3 animate-pulse')} style={known ? { width: `${Math.max(1, value)}%` } : undefined} />
      </div>
      {description && <p className="mt-1.5 text-sm">{description}</p>}
      {info && <p className="mt-0.5 text-xs text-slate-500">{info}</p>}
    </div>
  )
}

/** Empty table or section: what's missing and the action that fills it. */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="px-4 py-8 text-center">
      <p className="font-semibold">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-lg text-sm text-slate-500 dark:text-slate-400">{children}</p>}
      {action && <div className="mt-3 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}

// ---------- form controls ----------

const FIELD =
  'border border-[#8c8c94] bg-white text-sm text-ink outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/30 ' +
  'disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200'

export function SearchInput({
  value, onChange, placeholder, ariaLabel, className, onEnter,
}: { value: string; onChange: (v: string) => void; placeholder: string; ariaLabel?: string; className?: string; onEnter?: () => void }) {
  return (
    <div className={cx('relative', className)}>
      <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onEnter?.() }}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className={cx(FIELD, 'w-full py-1.5 pl-8 pr-3 placeholder:italic placeholder:text-[#656871]')}
      />
    </div>
  )
}

export function Select<V extends string>({
  value, options, onChange, disabled, ariaLabel, className,
}: { value: V | null; options: { value: V; label: string }[]; onChange: (v: V) => void; disabled?: boolean; ariaLabel?: string; className?: string }) {
  return (
    <select
      value={value ?? ''}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value as V)}
      className={cx(FIELD, 'px-2 py-1.5', className)}
    >
      {value === null && <option value="" disabled>Choose…</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

/** A checkbox with its label (and an optional description underneath). */
export function Checkbox({
  checked, onChange, children, description, disabled,
}: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId()
  return (
    <div className={cx('flex items-start gap-2', disabled && 'opacity-50')}>
      <input
        id={id} type="checkbox" checked={checked} disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-brand-600"
      />
      <label htmlFor={id} className="text-sm">
        <span>{children}</span>
        {description && <span className="block text-xs text-slate-500">{description}</span>}
      </label>
    </div>
  )
}

/** Joined buttons, one active (SAP-C03's status picker). `tone` colours the active option. */
export function Segmented<V extends string>({
  value, options, onChange, label, size = 'sm',
}: {
  value: V | null
  options: { value: V; label: ReactNode; icon?: ReactNode; tone?: 'brand' | 'green' | 'amber' }[]
  onChange: (v: V) => void
  label: string
  size?: 'xs' | 'sm'
}) {
  const ON = {
    brand: 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-500',
    green: 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
    amber: 'border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  }
  return (
    <div className="inline-flex" role="radiogroup" aria-label={label}>
      {options.map((o, i) => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              'flex items-center gap-1 border font-semibold',
              size === 'xs' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
              i > 0 && '-ml-px',
              active
                ? cx('relative z-10', ON[o.tone ?? 'brand'])
                : 'border-slate-300 text-slate-500 hover:text-ink dark:border-slate-600 dark:text-slate-400 dark:hover:text-white',
            )}
          >
            {o.icon}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Bordered radio cards (one choice from a few, with descriptions). */
export function RadioCards<V extends string>({
  value, options, onChange, label,
}: { value: V; options: { value: V; label: string; description?: string }[]; onChange: (v: V) => void; label: string }) {
  const name = useId()
  return (
    <fieldset>
      <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {options.map((o) => {
          const on = value === o.value
          return (
            <label
              key={o.value}
              className={cx(
                'flex cursor-pointer items-start gap-2 border px-3 py-2 text-sm',
                on ? 'border-brand-600 bg-brand-50 dark:bg-brand-600/10' : 'border-line hover:border-brand-500 dark:border-slate-700',
              )}
            >
              <input type="radio" name={name} checked={on} onChange={() => onChange(o.value)} className="mt-1 accent-brand-600" />
              <span>
                <span className="font-semibold">{o.label}</span>
                {o.description && <span className="block text-xs text-slate-500">{o.description}</span>}
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
