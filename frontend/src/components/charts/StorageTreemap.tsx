import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy'
import { ArrowLeft, LayoutGrid, Rows3 } from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useFolderTree } from '../../hooks/useAnalytics'
import { useFolderPath } from '../../hooks/useFiles'
import type { FolderNode } from '../../types/analytics'
import { formatBytes } from '../../utils/format'
import { Button, cx, EmptyState, KeyValues, Segmented, Skeleton } from '../ui/core'
import { Table } from '../ui/table'

const HEIGHT = 380
const LOOSE = '__loose__'

interface Tile extends FolderNode { loose?: boolean }

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, width }
}

const filesLink = (id: string) => `/files?folder=${encodeURIComponent(id)}`

/**
 * Folder treemap: area = storage. Click or Enter zooms into a folder, the path (or Backspace) goes back up,
 * arrow keys move between tiles. "Files directly here" is the grey tile. A table view shows the same numbers.
 */
export default function StorageTreemap({ folder, onFolderChange }: { folder: string | null; onFolderChange: (id: string | null) => void }) {
  const tree = useFolderTree(folder)
  const path = useFolderPath(folder ?? 'root')
  const [view, setView] = useState<'map' | 'table'>('map')
  const [active, setActive] = useState<string | null>(null)
  const { ref, width } = useWidth()
  const tileRefs = useRef(new Map<string, HTMLButtonElement>())
  const t = tree.data

  const tiles: Tile[] = useMemo(() => {
    if (!t) return []
    const list: Tile[] = [...t.children]
    if (t.loose_bytes > 0) {
      list.push({ google_file_id: LOOSE, name: 'Files directly here', bytes: t.loose_bytes, files: t.loose_files, has_subfolders: false, loose: true })
    }
    return list
  }, [t])

  const layout = useMemo(() => {
    if (!width || !tiles.length) return []
    const root = hierarchy<{ children?: Tile[] } & Partial<Tile>>({ children: tiles })
      .sum((d) => (d.children ? 0 : d.bytes ?? 0))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    const laid = treemap<{ children?: Tile[] } & Partial<Tile>>().tile(treemapSquarify).size([width, HEIGHT]).paddingInner(2).round(true)(root)
    return laid.leaves().map((l) => ({ tile: l.data as Tile, x: l.x0, y: l.y0, w: l.x1 - l.x0, h: l.y1 - l.y0 }))
  }, [tiles, width])

  const total = tiles.reduce((s, x) => s + x.bytes, 0)
  const pct = (b: number) => (total ? ((b / total) * 100).toFixed(1) : '0')
  const focusTile = (id: string) => { setActive(id); tileRefs.current.get(id)?.focus() }
  const open = (x: Tile) => { if (!x.loose && x.has_subfolders) { setActive(null); onFolderChange(x.google_file_id) } }
  const up = () => {
    const p = path.data
    if (!folder) return
    onFolderChange(p && p.length > 1 ? p[p.length - 2].google_file_id : null)
  }

  const onKey = (e: KeyboardEvent, i: number) => {
    const order = layout.map((l) => l.tile.google_file_id)
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); focusTile(order[Math.min(order.length - 1, i + 1)]) }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); focusTile(order[Math.max(0, i - 1)]) }
    if (e.key === 'Backspace') { e.preventDefault(); up() }
  }

  const detail = tiles.find((x) => x.google_file_id === active) ?? tiles[0]
  const crumbs = [{ id: null as string | null, name: 'My Drive' }, ...(folder ? (path.data ?? []).map((p) => ({ id: p.google_file_id as string | null, name: p.name })) : [])]
  const go = (id: string | null) => { setActive(null); onFolderChange(id) }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <nav aria-label="Treemap folder" className="flex flex-wrap items-center gap-1 text-sm">
          {crumbs.map((c, i) => (
            <Fragment key={c.id ?? 'root'}>
              {i > 0 && <span className="text-slate-400">/</span>}
              {i === crumbs.length - 1
                ? <span aria-current="location" className="font-bold">{c.name}</span>
                : <Button variant="link" onClick={() => go(c.id)}>{c.name}</Button>}
            </Fragment>
          ))}
        </nav>
        {folder && <Button variant="link" icon={<ArrowLeft size={14} />} onClick={up}>Up one level</Button>}
        <div className="ml-auto">
          <Segmented
            label="View"
            value={view}
            onChange={setView}
            options={[{ value: 'map', label: 'Treemap', icon: <LayoutGrid size={13} /> }, { value: 'table', label: 'Table', icon: <Rows3 size={13} /> }]}
          />
        </div>
      </div>

      {tree.isError ? (
        <p className="py-6 text-center text-sm text-rose-600">
          Couldn&apos;t load folder sizes. If the server was just updated, restart it to enable this view.{' '}
          <Button variant="link" onClick={() => tree.refetch()}>Retry</Button>
        </p>
      ) : view === 'table' ? (
        <div className="border border-line dark:border-slate-700">
          <Table<Tile>
            items={tiles}
            trackBy={(x) => x.google_file_id}
            loading={tree.isPending}
            empty={<EmptyState title="No files here" />}
            columns={[
              { id: 'name', header: 'Folder', cell: (x) => (x.has_subfolders ? <Button variant="link" onClick={() => open(x)}>{x.name}</Button> : x.name) },
              { id: 'size', header: 'Size', align: 'right', cell: (x) => formatBytes(x.bytes) },
              { id: 'share', header: 'Share', align: 'right', cell: (x) => `${pct(x.bytes)}%` },
              { id: 'files', header: 'Files', align: 'right', cell: (x) => x.files.toLocaleString() },
              { id: 'show', header: '', cell: (x) => !x.loose && <Button variant="link" to={filesLink(x.google_file_id)}>Show files</Button> },
            ]}
          />
        </div>
      ) : (
        <div ref={ref} className="relative w-full" style={{ height: HEIGHT }}>
          {tree.isPending && <Skeleton className="h-full w-full" />}
          {t && !tiles.length && <EmptyState title="No files here">This folder holds nothing that uses your storage.</EmptyState>}
          <div role="list" aria-label={`Folders in ${t?.name ?? 'My Drive'} by size`} className={cx('transition-opacity', tree.isPlaceholderData && 'opacity-60')}>
            {layout.map(({ tile, x, y, w, h }, i) => {
              const big = w > 90 && h > 44
              const on = active === tile.google_file_id
              return (
                <button
                  key={tile.google_file_id}
                  role="listitem"
                  ref={(el) => { if (el) tileRefs.current.set(tile.google_file_id, el); else tileRefs.current.delete(tile.google_file_id) }}
                  type="button"
                  aria-label={`${tile.name}: ${formatBytes(tile.bytes)}, ${pct(tile.bytes)}%, ${tile.files.toLocaleString()} files${tile.has_subfolders ? '. Press Enter to open.' : ''}`}
                  onClick={() => { setActive(tile.google_file_id); open(tile) }}
                  onMouseEnter={() => setActive(tile.google_file_id)}
                  onFocus={() => setActive(tile.google_file_id)}
                  onKeyDown={(e) => onKey(e, i)}
                  className={cx(
                    'absolute flex flex-col items-start overflow-hidden text-left outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-brand-600',
                    tile.loose
                      ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      : on ? 'bg-[#b8d8f5] text-brand-900 dark:bg-[#24507c] dark:text-white' : 'bg-brand-100 text-brand-900 dark:bg-[#1b3a5c] dark:text-slate-100',
                    big ? 'px-2 py-1.5' : 'p-0',
                    tile.has_subfolders ? 'cursor-zoom-in' : 'cursor-default',
                  )}
                  style={{ left: x, top: y, width: w, height: h }}
                >
                  {big && (
                    <>
                      <span className="max-w-full truncate text-[13px] font-semibold leading-[18px]">{tile.name}</span>
                      <span className="text-xs leading-4" data-numeric>{formatBytes(tile.bytes)}</span>
                    </>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {view === 'map' && detail && (
        <div className="border-t border-line pt-4 dark:border-slate-700">
          <KeyValues
            columns={4}
            items={[
              { label: detail.loose ? 'Files directly in this folder' : 'Folder', value: <span className="font-semibold">{detail.name}</span> },
              { label: 'Size', value: `${formatBytes(detail.bytes)} (${pct(detail.bytes)}%)` },
              { label: 'Files', value: detail.files.toLocaleString() },
              {
                label: 'Actions',
                value: (
                  <span className="flex flex-wrap gap-3">
                    {detail.has_subfolders && <Button variant="link" onClick={() => open(detail)}>Open in treemap</Button>}
                    {!detail.loose && <Button variant="link" to={filesLink(detail.google_file_id)}>Show files</Button>}
                  </span>
                ),
              },
            ]}
          />
        </div>
      )}
    </div>
  )
}
