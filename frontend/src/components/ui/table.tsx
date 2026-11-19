import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { cx, Skeleton } from './core'

export interface Column<T> {
  id: string
  header: ReactNode
  cell: (item: T) => ReactNode
  /** Sortable when set; the value passed to onSort. */
  sortField?: string
  align?: 'right'
  className?: string
}

export interface TableProps<T> {
  items: T[]
  columns: Column<T>[]
  trackBy: (item: T) => string | number
  loading?: boolean
  loadingRows?: number
  empty?: ReactNode
  sort?: { field: string; desc: boolean }
  onSort?: (field: string, desc: boolean) => void
  /** Multi-select with a checkbox column. */
  selection?: {
    selected: T[]
    onChange: (selected: T[]) => void
    isDisabled?: (item: T) => boolean
    label: (item: T) => string
  }
  /** Expandable parent rows: children render underneath, indented. */
  tree?: {
    children: (item: T) => T[]
    isParent: (item: T) => boolean
    isExpanded: (item: T) => boolean
    onToggle: (item: T, expanded: boolean) => void
  }
  visibleColumns?: string[]
  wrap?: boolean
  /** Fades the rows while newer data loads. */
  dimmed?: boolean
  ariaLabel?: string
}

/** A plain bordered data table (SAP-C03's markdown-table look): grey header row, hairline rows, hover tint. */
export function Table<T>({
  items, columns, trackBy, loading, loadingRows = 5, empty, sort, onSort, selection, tree, visibleColumns, wrap = true, dimmed, ariaLabel,
}: TableProps<T>) {
  const cols = visibleColumns ? columns.filter((c) => visibleColumns.includes(c.id)) : columns
  const selectedKeys = useMemo(() => new Set(selection?.selected.map(trackBy)), [selection, trackBy])
  const selectable = selection ? items.filter((i) => !selection.isDisabled?.(i)) : []
  const allOn = selectable.length > 0 && selectable.every((i) => selectedKeys.has(trackBy(i)))
  const someOn = selectable.some((i) => selectedKeys.has(trackBy(i)))
  const span = cols.length + (selection ? 1 : 0)

  const toggle = (item: T, on: boolean) => {
    if (!selection) return
    const k = trackBy(item)
    selection.onChange(on ? [...selection.selected, item] : selection.selected.filter((s) => trackBy(s) !== k))
  }

  const th = 'border-b border-line px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700'
  const td = cx('px-3 py-2 align-top', !wrap && 'whitespace-nowrap')

  const renderRow = (item: T, depth: number) => {
    const k = trackBy(item)
    const parent = tree?.isParent(item) ?? false
    const open = parent && tree!.isExpanded(item)
    const disabled = selection?.isDisabled?.(item) ?? false
    return (
      <Fragment key={k}>
        <tr className={cx('border-t border-line hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40', parent && 'bg-[#fafafa] dark:bg-slate-900/60', selectedKeys.has(k) && 'bg-brand-50 dark:bg-brand-600/10')}>
          {selection && (
            <td className="w-10 px-3 py-2 align-top">
              {!disabled && (
                <input
                  type="checkbox"
                  checked={selectedKeys.has(k)}
                  onChange={(e) => toggle(item, e.target.checked)}
                  aria-label={selection.label(item)}
                  className="mt-1 h-4 w-4 accent-brand-600"
                />
              )}
            </td>
          )}
          {cols.map((c, ci) => (
            <td key={c.id} className={cx(td, c.align === 'right' && 'text-right', c.className)}>
              {ci === 0 && tree ? (
                <div className="flex items-start gap-1" style={{ paddingLeft: depth * 24 }}>
                  {parent ? (
                    <button
                      type="button"
                      onClick={() => tree.onToggle(item, !open)}
                      aria-expanded={open}
                      aria-label={open ? 'Collapse group' : 'Expand group'}
                      className="-ml-1 mt-0.5 p-0.5 text-slate-500 hover:text-ink dark:hover:text-white"
                    >
                      {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </button>
                  ) : null}
                  <div className="min-w-0 flex-1">{c.cell(item)}</div>
                </div>
              ) : c.cell(item)}
            </td>
          ))}
        </tr>
        {open && tree!.children(item).map((child) => renderRow(child, depth + 1))}
      </Fragment>
    )
  }

  return (
    <div className="dc-table overflow-x-auto">
      <table className={cx('w-full border-collapse text-sm transition-opacity', dimmed && 'opacity-60')} aria-label={ariaLabel} aria-busy={loading || undefined}>
        <thead className="bg-[#fafafa] dark:bg-slate-800/60">
          <tr>
            {selection && (
              <th className={cx(th, 'w-10')}>
                <input
                  type="checkbox"
                  checked={allOn}
                  ref={(el) => { if (el) el.indeterminate = !allOn && someOn }}
                  disabled={!selectable.length}
                  onChange={(e) => selection.onChange(e.target.checked ? [...selection.selected.filter((s) => !selectable.some((i) => trackBy(i) === trackBy(s))), ...selectable] : selection.selected.filter((s) => !selectable.some((i) => trackBy(i) === trackBy(s))))}
                  aria-label="Select all on this page"
                  className="h-4 w-4 accent-brand-600"
                />
              </th>
            )}
            {cols.map((c) => {
              const active = sort?.field === c.sortField && c.sortField !== undefined
              return (
                <th
                  key={c.id}
                  className={cx(th, c.align === 'right' && 'text-right', c.className)}
                  aria-sort={active ? (sort!.desc ? 'descending' : 'ascending') : undefined}
                >
                  {c.sortField && onSort ? (
                    <button
                      type="button"
                      onClick={() => onSort(c.sortField!, active ? !sort!.desc : false)}
                      className={cx('inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink dark:hover:text-white', active && 'text-ink dark:text-slate-100')}
                    >
                      {c.header}
                      {active ? (sort!.desc ? <ArrowDown size={12} /> : <ArrowUp size={12} />) : <ArrowDown size={12} className="opacity-0" />}
                    </button>
                  ) : c.header}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {loading && !items.length
            ? Array.from({ length: loadingRows }, (_, i) => (
                <tr key={i} className="border-t border-line dark:border-slate-800">
                  <td colSpan={span} className="px-3 py-2.5"><Skeleton className="h-4" style={{ width: `${85 - (i % 3) * 15}%` }} /></td>
                </tr>
              ))
            : !items.length
              ? <tr><td colSpan={span}>{empty}</td></tr>
              : items.map((it) => renderRow(it, 0))}
        </tbody>
      </table>
    </div>
  )
}

/** Page numbers with previous and next; long ranges collapse around the current page. */
export function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null
  const nums: (number | '…')[] = []
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) nums.push(p)
    else if (nums[nums.length - 1] !== '…') nums.push('…')
  }
  const btn = 'min-w-7 px-1.5 py-0.5 text-sm'
  return (
    <nav aria-label="Pagination" className="flex items-center gap-0.5">
      <button className={cx(btn, 'text-slate-500 hover:text-ink disabled:opacity-30 dark:hover:text-white')} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
      {nums.map((n, i) => n === '…'
        ? <span key={`e${i}`} className="px-1 text-slate-400">…</span>
        : (
          <button
            key={n}
            onClick={() => onChange(n)}
            aria-label={`Page ${n}`}
            aria-current={n === page ? 'page' : undefined}
            className={cx(btn, n === page ? 'border-b-2 border-brand-600 font-bold text-brand-600 dark:text-brand-500' : 'text-slate-600 hover:text-brand-600 dark:text-slate-300')}
          >
            {n}
          </button>
        ))}
      <button className={cx(btn, 'text-slate-500 hover:text-ink disabled:opacity-30 dark:hover:text-white')} disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
    </nav>
  )
}

/** A table toolbar: filters on the left, pagination on the right. */
export function Toolbar({ children, pagination }: { children?: ReactNode; pagination?: ReactNode }) {
  if (!children && !pagination) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5 dark:border-slate-700">
      <div className="flex flex-1 flex-wrap items-center gap-4">{children}</div>
      {pagination}
    </div>
  )
}

/** Client-side filter, sort and pagination for lists that arrive whole. */
export function useCollection<T>(
  all: T[],
  opts: {
    pageSize: number
    filter?: (item: T, text: string) => boolean
    sort?: { field: string; desc: boolean }
    comparators?: Record<string, (a: T, b: T) => number>
  },
) {
  const [text, setTextState] = useState('')
  const [sort, setSortState] = useState(opts.sort)
  const [page, setPage] = useState(1)
  const filtered = useMemo(() => {
    const t = text.trim()
    const list = t && opts.filter ? all.filter((i) => opts.filter!(i, t)) : all
    const cmp = sort && opts.comparators?.[sort.field]
    return cmp ? [...list].sort((a, b) => (sort.desc ? -cmp(a, b) : cmp(a, b))) : list
  }, [all, text, sort, opts.filter, opts.comparators])
  const pages = Math.max(1, Math.ceil(filtered.length / opts.pageSize))
  const current = Math.min(page, pages)
  return {
    items: filtered.slice((current - 1) * opts.pageSize, current * opts.pageSize),
    filteredCount: filtered.length,
    text,
    setText: (t: string) => { setTextState(t); setPage(1) },
    sort,
    setSort: (field: string, desc: boolean) => { setSortState({ field, desc }); setPage(1) },
    page: current,
    pages,
    setPage,
  }
}
