import Box from '@cloudscape-design/components/box'
import Button from '@cloudscape-design/components/button'
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs'
import SegmentedControl from '@cloudscape-design/components/segmented-control'
import Skeleton from '@cloudscape-design/components/skeleton'
import SpaceBetween from '@cloudscape-design/components/space-between'
import Table from '@cloudscape-design/components/table'
import {
  colorBorderDividerDefault, colorBorderItemFocused, colorChartsPaletteCategorical1, colorTextBodyDefault,
} from '@cloudscape-design/design-tokens'
import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useFolderTree } from '../../hooks/useAnalytics'
import { useFolderPath } from '../../hooks/useFiles'
import type { FolderNode } from '../../types/analytics'
import { formatBytes } from '../../utils/format'
import EmptyState from '../common/EmptyState'
import { AppButtonLink } from '../common/RouterLink'

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

/**
 * Folder treemap: area = storage. Click or Enter zooms into a folder, breadcrumbs (or Backspace) go back up,
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
    <SpaceBetween size="m">
      <SpaceBetween direction="horizontal" size="m" alignItems="center">
        <nav aria-label="Treemap folder">
          <SpaceBetween direction="horizontal" size="xxs" alignItems="center">
            {crumbs.map((c, i) => (
              <Box key={c.id ?? 'root'} variant="span" fontWeight={i === crumbs.length - 1 ? 'bold' : 'normal'}>
                {i > 0 && <Box variant="span" color="text-body-secondary" padding={{ right: 'xxs' }}>/</Box>}
                {i === crumbs.length - 1 ? <span aria-current="location">{c.name}</span> : <Button variant="inline-link" onClick={() => go(c.id)}>{c.name}</Button>}
              </Box>
            ))}
          </SpaceBetween>
        </nav>
        {folder && <Button variant="inline-link" iconName="arrow-left" onClick={up}>Up one level</Button>}
        <SegmentedControl
          label="View"
          selectedId={view}
          onChange={(e) => setView(e.detail.selectedId as 'map' | 'table')}
          options={[{ id: 'map', text: 'Treemap', iconName: 'view-full' }, { id: 'table', text: 'Table', iconName: 'view-horizontal' }]}
        />
      </SpaceBetween>

      {tree.isError ? (
        <Box textAlign="center" padding="l" color="text-status-error">
          Couldn&apos;t load folder sizes. If the server was just updated, restart it to enable this view.{' '}
          <Button variant="inline-link" onClick={() => tree.refetch()}>Retry</Button>
        </Box>
      ) : view === 'table' ? (
        <Table<Tile>
          variant="embedded"
          items={tiles}
          loading={tree.isPending}
          loadingText="Loading folders"
          columnDefinitions={[
            { id: 'name', header: 'Folder', isRowHeader: true, cell: (x) => (x.has_subfolders ? <Button variant="inline-link" onClick={() => open(x)}>{x.name}</Button> : x.name) },
            { id: 'size', header: 'Size', cell: (x) => formatBytes(x.bytes) },
            { id: 'share', header: 'Share', cell: (x) => (total ? `${((x.bytes / total) * 100).toFixed(1)}%` : '') },
            { id: 'files', header: 'Files', cell: (x) => x.files.toLocaleString() },
            { id: 'show', header: '', cell: (x) => !x.loose && <AppButtonLink variant="inline-link" href={`/files?folder=${encodeURIComponent(x.google_file_id)}`}>Show files</AppButtonLink> },
          ]}
          empty={<EmptyState title="No files here" />}
        />
      ) : (
        <div ref={ref} style={{ position: 'relative', height: HEIGHT, width: '100%' }}>
          {tree.isPending && <Skeleton width="100%" height={`${HEIGHT}px`} />}
          {t && !tiles.length && <EmptyState title="No files here">This folder holds nothing that uses your storage.</EmptyState>}
          <div role="list" aria-label={`Folders in ${t?.name ?? 'My Drive'} by size`} style={{ opacity: tree.isPlaceholderData ? 0.6 : 1 }}>
            {layout.map(({ tile, x, y, w, h }, i) => {
              const big = w > 90 && h > 44
              const share = total ? (tile.bytes / total) * 100 : 0
              return (
                <button
                  key={tile.google_file_id}
                  role="listitem"
                  ref={(el) => { if (el) tileRefs.current.set(tile.google_file_id, el); else tileRefs.current.delete(tile.google_file_id) }}
                  type="button"
                  className="dc-tile"
                  aria-label={`${tile.name}: ${formatBytes(tile.bytes)}, ${share.toFixed(1)}%, ${tile.files.toLocaleString()} files${tile.has_subfolders ? '. Press Enter to open.' : ''}`}
                  onClick={() => { setActive(tile.google_file_id); open(tile) }}
                  onMouseEnter={() => setActive(tile.google_file_id)}
                  onFocus={() => setActive(tile.google_file_id)}
                  onKeyDown={(e) => onKey(e, i)}
                  style={{
                    position: 'absolute', left: x, top: y, width: w, height: h, padding: big ? '6px 8px' : 0,
                    border: 'none', borderRadius: 4, overflow: 'hidden', textAlign: 'left', verticalAlign: 'top',
                    display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start',
                    cursor: tile.has_subfolders ? 'zoom-in' : 'default',
                    background: tile.loose ? colorBorderDividerDefault : colorChartsPaletteCategorical1,
                    color: tile.loose ? colorTextBodyDefault : '#0f141a',
                    opacity: active && active !== tile.google_file_id ? 0.78 : 1,
                    ['--dc-focus' as string]: colorBorderItemFocused,
                  }}
                >
                  {big && (
                    <>
                      <span style={{ fontWeight: 600, fontSize: 13, lineHeight: '18px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{tile.name}</span>
                      <span style={{ fontSize: 12, lineHeight: '16px' }}>{formatBytes(tile.bytes)}</span>
                    </>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {view === 'map' && detail && (
        <KeyValuePairs
          columns={4}
          items={[
            { label: detail.loose ? 'Files directly in this folder' : 'Folder', value: detail.name },
            { label: 'Size', value: `${formatBytes(detail.bytes)} (${total ? ((detail.bytes / total) * 100).toFixed(1) : 0}%)` },
            { label: 'Files', value: detail.files.toLocaleString() },
            {
              label: 'Actions',
              value: (
                <SpaceBetween direction="horizontal" size="xs">
                  {detail.has_subfolders && <Button variant="inline-link" onClick={() => open(detail)}>Open in treemap</Button>}
                  {!detail.loose && <AppButtonLink variant="inline-link" href={`/files?folder=${encodeURIComponent(detail.google_file_id)}`}>Show files</AppButtonLink>}
                </SpaceBetween>
              ),
            },
          ]}
        />
      )}
    </SpaceBetween>
  )
}
