import Alert from '@cloudscape-design/components/alert'
import Badge from '@cloudscape-design/components/badge'
import Box from '@cloudscape-design/components/box'
import BreadcrumbGroup from '@cloudscape-design/components/breadcrumb-group'
import CollectionPreferences from '@cloudscape-design/components/collection-preferences'
import ContentLayout from '@cloudscape-design/components/content-layout'
import Header from '@cloudscape-design/components/header'
import Icon from '@cloudscape-design/components/icon'
import Link from '@cloudscape-design/components/link'
import Pagination from '@cloudscape-design/components/pagination'
import SpaceBetween from '@cloudscape-design/components/space-between'
import Table, { type TableProps } from '@cloudscape-design/components/table'
import TextFilter from '@cloudscape-design/components/text-filter'
import Toggle from '@cloudscape-design/components/toggle'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import EmptyState from '../components/common/EmptyState'
import InfoLink from '../components/common/InfoLink'
import { AppButtonLink } from '../components/common/RouterLink'
import { useFiles, useFolderPath } from '../hooks/useFiles'
import { errorMessage } from '../services/api'
import type { DriveFileItem, FileQuery } from '../types/file'
import { formatBytes, formatDate, friendlyType } from '../utils/format'

type SortKey = FileQuery['sort']
const PREFS_KEY = 'driveclean.files.prefs'
const COLUMN_IDS = ['name', 'type', 'size', 'modified', 'created', 'owner']

interface Prefs { pageSize: number; visibleContent: string[]; wrapLines: boolean }
const DEFAULT_PREFS: Prefs = { pageSize: 50, visibleContent: ['name', 'type', 'size', 'modified', 'owner'], wrapLines: false }

function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? 'null') as Partial<Prefs> | null
    return p ? { ...DEFAULT_PREFS, ...p } : DEFAULT_PREFS
  } catch {
    return DEFAULT_PREFS
  }
}

export default function FileExplorer() {
  const [params, setParams] = useSearchParams()
  const folder = params.get('folder') ?? 'root'
  const q = params.get('q') ?? ''
  const trashed = params.get('trashed') === '1'
  const sort = (params.get('sort') as SortKey | null) ?? 'name'
  const order = params.get('order') === 'desc' ? 'desc' : 'asc'
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1)
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) next.delete(k)
      else next.set(k, v)
    }
    setParams(next)
  }

  // Typing is instant; the URL (and the query) follows after a short pause.
  const [text, setText] = useState(q)
  const [lastQ, setLastQ] = useState(q)
  if (q !== lastQ) { setLastQ(q); setText(q) }
  useEffect(() => {
    if (text === q) return
    const t = setTimeout(() => update({ q: text || null, page: null }), 350)
    return () => clearTimeout(t)
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps

  const files = useFiles({ parent: folder, q, trashed, sort, order, page, pageSize: prefs.pageSize })
  const path = useFolderPath(folder)
  const total = files.data?.total ?? 0

  const openFolder = (id: string | null) => update({ folder: id, q: null, page: null })

  const columns: TableProps.ColumnDefinition<DriveFileItem>[] = [
    {
      id: 'name', header: 'Name', sortingField: 'name', isRowHeader: true,
      cell: (f) => (
        <SpaceBetween direction="horizontal" size="xs" alignItems="center">
          <Icon name={f.is_folder ? 'folder' : 'file'} variant={f.is_folder ? 'link' : 'subtle'} />
          {f.is_folder
            ? <Link onFollow={(e) => { e.preventDefault(); openFolder(f.google_file_id) }} href={`?folder=${f.google_file_id}`}>{f.name}</Link>
            : f.web_view_link
              ? <Link href={f.web_view_link} external externalIconAriaLabel="(opens in Google Drive)">{f.name}</Link>
              : f.name}
          {f.trashed && <Badge color="severity-medium">In Trash</Badge>}
        </SpaceBetween>
      ),
    },
    { id: 'type', header: 'Type', cell: (f) => friendlyType(f.mime_type) },
    { id: 'size', header: 'Size', sortingField: 'size', cell: (f) => (f.is_folder ? '' : formatBytes(f.size)) },
    { id: 'modified', header: 'Modified', sortingField: 'modified', cell: (f) => formatDate(f.modified_time) },
    { id: 'created', header: 'Created', sortingField: 'created', cell: (f) => formatDate(f.created_time) },
    { id: 'owner', header: 'Owner', cell: (f) => (f.is_owned_by_user ? 'You' : <Box variant="span" color="text-body-secondary">Shared with you</Box>) },
  ]

  const crumbs = [{ text: 'My Drive', href: '?' }, ...(path.data ?? []).map((p) => ({ text: p.name, href: `?folder=${p.google_file_id}` }))]

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          info={<InfoLink />}
          description="Every file and folder found by the last scan. Search covers your whole Drive."
          actions={!q && folder !== 'root' ? <AppButtonLink href={`/organizer?source=${encodeURIComponent(folder)}`}>Organize this folder</AppButtonLink> : undefined}
        >
          Files
        </Header>
      }
    >
      <SpaceBetween size="l">
        {files.isError && <Alert type="error">{errorMessage(files.error)}</Alert>}
        <Table<DriveFileItem>
          variant="full-page"
          trackBy="google_file_id"
          items={files.data?.items ?? []}
          columnDefinitions={columns}
          columnDisplay={COLUMN_IDS.map((id) => ({ id, visible: prefs.visibleContent.includes(id) }))}
          wrapLines={prefs.wrapLines}
          loading={files.isPending}
          loadingText="Loading files"
          sortingColumn={{ sortingField: sort }}
          sortingDescending={order === 'desc'}
          onSortingChange={(e) => update({
            sort: e.detail.sortingColumn.sortingField ?? 'name', order: e.detail.isDescending ? 'desc' : 'asc', page: null,
          })}
          header={
            <SpaceBetween size="xs">
              <Header counter={files.data ? `(${total.toLocaleString()})` : undefined}>
                {q ? 'Search results' : (path.data?.at(-1)?.name ?? 'My Drive')}
              </Header>
              {!q && folder !== 'root' && (
                <BreadcrumbGroup
                  ariaLabel="Folder path"
                  items={crumbs}
                  onFollow={(e) => {
                    e.preventDefault()
                    const id = new URLSearchParams(e.detail.href.slice(1)).get('folder')
                    openFolder(id)
                  }}
                />
              )}
            </SpaceBetween>
          }
          filter={
            <SpaceBetween direction="horizontal" size="l" alignItems="center">
              <div style={{ minWidth: 280 }}>
                <TextFilter
                  filteringText={text}
                  onChange={(e) => setText(e.detail.filteringText)}
                  filteringPlaceholder="Search all file names"
                  filteringAriaLabel="Search all file names"
                />
              </div>
              <Toggle checked={trashed} onChange={(e) => update({ trashed: e.detail.checked ? '1' : null, page: null })}>
                Show items in Trash
              </Toggle>
            </SpaceBetween>
          }
          pagination={
            <Pagination
              currentPageIndex={page}
              pagesCount={Math.max(1, Math.ceil(total / prefs.pageSize))}
              onChange={(e) => update({ page: e.detail.currentPageIndex === 1 ? null : String(e.detail.currentPageIndex) })}
              ariaLabels={{ nextPageLabel: 'Next page', previousPageLabel: 'Previous page', pageLabel: (n) => `Page ${n}` }}
            />
          }
          preferences={
            <CollectionPreferences
              title="Preferences"
              confirmLabel="Confirm"
              cancelLabel="Cancel"
              preferences={prefs}
              onConfirm={({ detail }) => {
                const next: Prefs = {
                  pageSize: detail.pageSize ?? prefs.pageSize,
                  visibleContent: [...(detail.visibleContent ?? prefs.visibleContent)],
                  wrapLines: detail.wrapLines ?? prefs.wrapLines,
                }
                setPrefs(next)
                try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(next)) } catch { /* keep for this visit only */ }
                update({ page: null })
              }}
              pageSizePreference={{ title: 'Files per page', options: [25, 50, 100].map((v) => ({ value: v, label: `${v} files` })) }}
              wrapLinesPreference={{ label: 'Wrap long names', description: 'Show full file names on several lines' }}
              visibleContentPreference={{
                title: 'Columns',
                options: [{
                  label: 'File details',
                  options: columns.map((c) => ({ id: c.id!, label: String(c.header), editable: c.id !== 'name' })),
                }],
              }}
            />
          }
          empty={
            q
              ? <EmptyState title="No files match your search">Try fewer letters, or check the spelling.</EmptyState>
              : <EmptyState title="This folder is empty">Or no scan has run yet. Start one from the dashboard.</EmptyState>
          }
        />
      </SpaceBetween>
    </ContentLayout>
  )
}
