import { useState } from 'react'
import EmptyState from '../components/common/EmptyState'
import InfoLink from '../components/common/InfoLink'
import { OperationStatusIndicator } from '../components/common/status'
import { Alert, Badge, Button, Checkbox, ExternalAnchor, KeyValues, PageHeader, Panel, ProgressBar, Secondary } from '../components/ui/core'
import { Modal } from '../components/ui/overlay'
import { Pagination, Table, Toolbar, useCollection } from '../components/ui/table'
import { useArchiveHistory, useArchives, useArchiveStatus, useCancelArchives, useExtractArchives } from '../hooks/useArchives'
import { useAuthStatus } from '../hooks/useGoogleDrive'
import { useNotify } from '../layouts/notifications'
import { errorMessage } from '../services/api'
import { authService } from '../services/authService'
import { folderUrl, type ArchiveItem, type Extraction } from '../types/archive'
import { formatBytes, formatDate } from '../utils/format'

const STAGE: Record<Extraction['stage'], string> = {
  queued: 'Waiting for a free slot', checking: 'Checking the archive in Drive', downloading: 'Downloading',
  uploading: 'Uploading files', trashing: 'Moving the archive to Trash', done: 'Done',
}

/** What happened to one archive, in a sentence. */
function outcome(e: Extraction): string {
  const files = `${e.files_done.toLocaleString()} of ${e.files_total.toLocaleString()} files`
  if (e.status === 'completed') {
    return e.archive_trashed ? `${files} extracted; archive moved to Trash.` : `${files} extracted. ${e.error_message ?? ''}`
  }
  if (e.status === 'failed' || e.status === 'cancelled') return e.error_message ?? (e.status === 'cancelled' ? 'Cancelled.' : 'Failed.')
  return e.stage === 'uploading' ? `${files} uploaded` : STAGE[e.stage]
}

function FolderLink({ e }: { e: Extraction }) {
  return e.folder_google_id
    ? <ExternalAnchor href={folderUrl(e.folder_google_id)}>{e.folder_name}</ExternalAnchor>
    : <span>{e.folder_name}</span>
}

function CurrentRun({ items, running }: { items: Extraction[]; running: boolean }) {
  const cancel = useCancelArchives()
  if (!items.length) return null
  const done = items.filter((e) => !['pending', 'running'].includes(e.status)).length
  const files = items.reduce((s, e) => s + e.files_done, 0)
  const total = items.reduce((s, e) => s + e.files_total, 0)
  return (
    <Panel
      title={running ? 'Extracting' : 'Last run'}
      counter={`(${done}/${items.length})`}
      actions={running && <Button loading={cancel.isPending} onClick={() => cancel.mutate()}>Cancel remaining</Button>}
    >
      <div className="flex flex-col gap-5">
        {running && (
          <ProgressBar
            label={`${done} of ${items.length} archives finished`}
            value={(done / items.length) * 100}
            info={total ? `${files.toLocaleString()} of ${total.toLocaleString()} files uploaded so far in the archives that have started.` : undefined}
          />
        )}
        <ul className="flex flex-col divide-y divide-line dark:divide-slate-700">
          {items.map((e) => (
            <li key={e.id} className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{e.archive_name} <Secondary className="font-normal">→ <FolderLink e={e} /></Secondary></span>
                <OperationStatusIndicator status={e.status} />
              </div>
              {e.status === 'running' && e.stage === 'uploading' && e.bytes_total > 0
                ? <ProgressBar value={(e.bytes_done / e.bytes_total) * 100} description={outcome(e)} info={`${formatBytes(e.bytes_done)} of ${formatBytes(e.bytes_total)}`} />
                : <p className={e.status === 'failed' ? 'text-sm text-rose-600' : 'text-sm text-slate-600 dark:text-slate-400'}>{outcome(e)}</p>}
              {e.files_skipped > 0 && <Secondary className="text-xs">{e.files_skipped.toLocaleString()} files were already uploaded by an earlier attempt.</Secondary>}
              {e.entries_ignored > 0 && <Secondary className="text-xs">{e.entries_ignored.toLocaleString()} entries skipped (links, unsafe paths or macOS metadata).</Secondary>}
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  )
}

function History() {
  const history = useArchiveHistory()
  const list = useCollection(history.data ?? [], { pageSize: 25 })
  return (
    <Panel
      title="History"
      counter={history.data ? `(${history.data.length.toLocaleString()})` : undefined}
      description="Archives moved to Trash are also listed in the Cleanup history, where you can restore them."
      actions={<Pagination page={list.page} pages={list.pages} onChange={list.setPage} />}
      flush
    >
      <Table<Extraction>
        items={list.items}
        trackBy={(e) => e.id}
        loading={history.isPending}
        empty={<EmptyState title="Nothing extracted yet">Archives you extract are listed here with the folder they went into.</EmptyState>}
        columns={[
          { id: 'when', header: 'When', className: 'whitespace-nowrap', cell: (e) => formatDate(e.completed_at ?? e.created_at) },
          { id: 'archive', header: 'Archive', cell: (e) => e.archive_name },
          { id: 'folder', header: 'Folder', cell: (e) => <FolderLink e={e} /> },
          { id: 'status', header: 'Status', cell: (e) => <OperationStatusIndicator status={e.status} /> },
          { id: 'result', header: 'Result', className: 'min-w-64', cell: (e) => <span className="text-sm">{outcome(e)}</span> },
        ]}
      />
    </Panel>
  )
}

const COMPARE = {
  name: (a: ArchiveItem, b: ArchiveItem) => a.file.name.localeCompare(b.file.name),
  size: (a: ArchiveItem, b: ArchiveItem) => (a.file.size ?? 0) - (b.file.size ?? 0),
  parent: (a: ArchiveItem, b: ArchiveItem) => a.parent_name.localeCompare(b.parent_name),
}

export default function Archives() {
  const auth = useAuthStatus()
  const canWrite = auth.data?.can_trash ?? false
  const [ownedOnly, setOwnedOnly] = useState(true)
  const archives = useArchives(ownedOnly)
  const status = useArchiveStatus()
  const extract = useExtractArchives()
  const { notify } = useNotify()
  const [selected, setSelected] = useState<ArchiveItem[]>([])
  const [confirming, setConfirming] = useState(false)

  const data = archives.data
  const running = status.data?.running ?? false
  // Only your own archives can be extracted: the original goes to Trash, which Drive allows only for the owner.
  const usable = (i: ArchiveItem) => i.file.is_owned_by_user && (i.kind !== 'rar' || (data?.rar_supported ?? false))
  const all = data?.items ?? []
  const list = useCollection(all, { pageSize: 50, sort: { field: 'size', desc: true }, comparators: COMPARE })
  const chosen = selected.filter(usable)
  const bytes = chosen.reduce((s, i) => s + (i.file.size ?? 0), 0)

  const run = () =>
    extract.mutate(chosen.map((i) => i.file_id), {
      onSuccess: () => {
        notify({ id: 'arc-start', type: 'success', autoDismissMs: 6000, content: `Extracting ${chosen.length} archive${chosen.length === 1 ? '' : 's'}. Progress shows below.` })
        setSelected([])
      },
      onError: (e) => notify({ id: 'arc-start', type: 'error', header: "Couldn't start extracting", content: errorMessage(e) }),
      onSettled: () => setConfirming(false),
    })

  return (
    <div>
      <PageHeader
        title="Archives"
        counter={data ? `(${all.length})` : undefined}
        info={<InfoLink />}
        description="Zip, rar and tar files in your Drive. Extracting one puts its contents in a new folder with the archive's name, right next to it, then moves the archive to Trash."
        actions={
          <Button variant="primary" disabled={!canWrite || !chosen.length || running} onClick={() => setConfirming(true)}>
            {chosen.length ? `Extract ${chosen.length} archive${chosen.length === 1 ? '' : 's'}` : 'Extract archives'}
          </Button>
        }
      />
      <div className="flex flex-col gap-6">
        {!canWrite && auth.data && (
          <Alert type="warning" header="Permission needed" action={<Button href={authService.upgradeUrl}>Allow cleanup</Button>}>
            Extracting creates folders and files in your Drive, which needs the same broader Google permission as cleanup.
          </Alert>
        )}
        {archives.isError && <Alert type="error">{errorMessage(archives.error)}</Alert>}
        {data && !data.rar_supported && all.some((i) => i.kind === 'rar') && (
          <Alert type="info">RAR archives can't be extracted until unrar, unar, bsdtar or 7-Zip is installed on the server.</Alert>
        )}

        <CurrentRun items={status.data?.extractions ?? []} running={running} />

        <Panel
          title="Your archives"
          counter={selected.length ? `(${selected.length}/${all.length})` : undefined}
          description={`${ownedOnly ? 'Archives you own.' : 'Your archives and ones shared with you; only your own can be extracted.'} Up to ${data?.workers ?? 3} are extracted at the same time.`}
          actions={
            <>
              <Button disabled={!all.length} onClick={() => setSelected(all.filter(usable))}>Select all</Button>
              <Button disabled={!selected.length} onClick={() => setSelected([])}>Clear</Button>
            </>
          }
          flush
        >
          <Toolbar pagination={<Pagination page={list.page} pages={list.pages} onChange={list.setPage} />}>
            <Checkbox
              checked={ownedOnly}
              onChange={(v) => {
                setOwnedOnly(v)
                if (v) setSelected((s) => s.filter((i) => i.file.is_owned_by_user))
              }}
            >
              Owned by me
            </Checkbox>
          </Toolbar>
          <Table<ArchiveItem>
            items={list.items}
            trackBy={(i) => i.file_id}
            loading={archives.isPending}
            sort={list.sort}
            onSort={list.setSort}
            selection={{ selected, onChange: setSelected, isDisabled: (i) => !usable(i), label: (i) => `Select ${i.file.name}` }}
            columns={[
              {
                id: 'name', header: 'Archive', sortField: 'name',
                cell: (i) => (
                  <div className="flex flex-col gap-0.5">
                    <ExternalAnchor href={i.file.web_view_link}>{i.file.name}</ExternalAnchor>
                    <Secondary className="text-xs">
                      {i.file.is_owned_by_user ? `Extracts to ${i.parent_name} / ${i.folder_name}` : 'Shared with you; only the owner can extract it'}
                    </Secondary>
                  </div>
                ),
              },
              { id: 'kind', header: 'Type', cell: (i) => <Badge color={usable(i) ? 'blue' : 'grey'}>{i.kind.toUpperCase()}</Badge> },
              { id: 'parent', header: 'Folder', sortField: 'parent', cell: (i) => i.parent_name },
              { id: 'size', header: 'Size', sortField: 'size', align: 'right', cell: (i) => formatBytes(i.file.size) },
              {
                id: 'last', header: 'Last attempt', className: 'min-w-48',
                cell: (i) => i.last
                  ? <div className="flex flex-col gap-0.5"><OperationStatusIndicator status={i.last.status} />{i.last.status !== 'completed' && i.last.error_message && <span className="text-xs text-rose-600">{i.last.error_message}</span>}</div>
                  : <Secondary>Not extracted</Secondary>,
              },
            ]}
            empty={<EmptyState title="No archives found">Zip, rar and tar files {ownedOnly ? 'you own ' : ''}show up here after a scan or sync.</EmptyState>}
          />
        </Panel>

        <History />
      </div>

      <Modal
        visible={confirming}
        onDismiss={() => setConfirming(false)}
        header={`Extract ${chosen.length} archive${chosen.length === 1 ? '' : 's'}?`}
        footer={
          <>
            <Button variant="link" className="mr-2" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button variant="primary" loading={extract.isPending} onClick={run}>Extract and move to Trash</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <KeyValues
            columns={3}
            items={[
              { label: 'Archives', value: <span className="font-semibold">{chosen.length.toLocaleString()}</span> },
              { label: 'Size', value: <span className="font-semibold">{formatBytes(bytes)}</span> },
              { label: 'New folders', value: <span className="font-semibold">{chosen.length.toLocaleString()}</span> },
            ]}
          />
          <ul className="list-disc pl-5 text-sm">
            <li>Each archive is downloaded to the DriveClean server, and its files are uploaded into a new folder with the archive&apos;s name in the same place.</li>
            <li>The archive moves to Trash only after every file is uploaded and checked. If anything fails, the archive stays and extracting it again continues where it stopped.</li>
            <li>Extracted files take more space than the archives, and Trash counts towards your storage until it is emptied or 30 days pass.</li>
          </ul>
        </div>
      </Modal>
    </div>
  )
}
