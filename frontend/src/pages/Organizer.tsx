import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import EmptyState from '../components/common/EmptyState'
import InfoLink from '../components/common/InfoLink'
import { OperationStatusIndicator } from '../components/common/status'
import { Alert, AppLink, Badge, Button, ExternalAnchor, KeyValues, PageHeader, Panel, Secondary } from '../components/ui/core'
import { Modal, Popover } from '../components/ui/overlay'
import { Pagination, Table, Toolbar, useCollection } from '../components/ui/table'
import { useAuthStatus } from '../hooks/useGoogleDrive'
import { useApplyMoves, useOrganizerHistory, useSuggestions, useUndoMove } from '../hooks/useOrganizer'
import { useNotify } from '../layouts/notifications'
import { errorMessage } from '../services/api'
import { authService } from '../services/authService'
import type { Operation } from '../types/cleanup'
import type { Suggestion } from '../types/organizer'
import { formatBytes, formatDate } from '../utils/format'

const MAX_MOVES = 200

function Confidence({ s }: { s: Suggestion }) {
  return (
    <Popover
      header="Why this folder"
      ariaLabel={`${s.confidence} confidence, ${Math.round(s.score * 100)}%. Show reasons.`}
      trigger={
        <span className="inline-flex items-center gap-1.5">
          <Badge color={s.confidence === 'high' ? 'green' : 'grey'}>{s.confidence === 'high' ? 'High' : 'Medium'}</Badge>
          <span data-numeric className="text-brand-600 dark:text-brand-500">{Math.round(s.score * 100)}%</span>
        </span>
      }
    >
      <ul className="list-disc pl-4">{s.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
    </Popover>
  )
}

function History({ canMove }: { canMove: boolean }) {
  const history = useOrganizerHistory()
  const undo = useUndoMove()
  const { notify } = useNotify()
  const list = useCollection(history.data ?? [], { pageSize: 25 })

  const undoOne = (o: Operation) =>
    undo.mutate(o.id, {
      onSuccess: () => notify({ id: `undo-${o.id}`, type: 'success', autoDismissMs: 6000, content: `Moved ${o.file_name} back.` }),
      onError: (e) => notify({ id: `undo-${o.id}`, type: 'error', header: `Couldn't undo the move of ${o.file_name}`, content: errorMessage(e) }),
    })

  return (
    <Panel
      title="Move history"
      counter={history.data ? `(${history.data.length.toLocaleString()})` : undefined}
      actions={<Pagination page={list.page} pages={list.pages} onChange={list.setPage} />}
      flush
    >
      <Table<Operation>
        items={list.items}
        trackBy={(o) => o.id}
        loading={history.isPending}
        empty={<EmptyState title="No moves yet">Files you move here are listed, and each move can be undone.</EmptyState>}
        columns={[
          { id: 'when', header: 'When', className: 'whitespace-nowrap', cell: (o) => formatDate(o.completed_at ?? o.created_at) },
          { id: 'action', header: 'Action', cell: (o) => (o.operation_type === 'unmove' ? 'Move undone' : 'Moved to folder') },
          {
            id: 'file', header: 'File',
            cell: (o) => (
              <div className="flex flex-col gap-0.5">
                <span>{o.file_name}</span>
                {o.file_deleted && <Secondary className="text-xs">Deleted from Drive</Secondary>}
                {o.error_message && <span className="text-xs text-rose-600">{o.error_message}</span>}
              </div>
            ),
          },
          { id: 'status', header: 'Status', cell: (o) => <OperationStatusIndicator status={o.status} /> },
          {
            id: 'undo', header: '',
            cell: (o) => o.operation_type === 'move' && o.status === 'completed' && !o.file_deleted && (
              <Button variant="link" disabled={!canMove || undo.isPending} onClick={() => undoOne(o)} ariaLabel={`Undo move of ${o.file_name}`}>Undo</Button>
            ),
          },
        ]}
      />
    </Panel>
  )
}

const SUGGEST_COMPARE = {
  name: (a: Suggestion, b: Suggestion) => a.file.name.localeCompare(b.file.name),
  folder_name: (a: Suggestion, b: Suggestion) => a.folder_name.localeCompare(b.folder_name),
  score: (a: Suggestion, b: Suggestion) => a.score - b.score,
  size: (a: Suggestion, b: Suggestion) => (a.file.size ?? 0) - (b.file.size ?? 0),
}

export default function Organizer() {
  const [params] = useSearchParams()
  const source = params.get('source') ?? 'root'
  const auth = useAuthStatus()
  const canMove = auth.data?.can_trash ?? false // same full-Drive permission as cleanup
  const suggestions = useSuggestions(source)
  const apply = useApplyMoves()
  const { notify } = useNotify()
  // Only the user's explicit choices count; nothing is pre-selected.
  const [selected, setSelected] = useState<Suggestion[]>([])
  const [confirming, setConfirming] = useState(false)

  const all = suggestions.data?.items ?? []
  const high = all.filter((i) => i.confidence === 'high')
  const list = useCollection(all, { pageSize: 50, sort: { field: 'score', desc: true }, comparators: SUGGEST_COMPARE })
  const tooMany = selected.length > MAX_MOVES
  const folders = new Set(selected.map((s) => s.folder_id)).size

  const run = () =>
    apply.mutate(selected.map((i) => ({ file_id: i.file.google_file_id, folder_id: i.folder_id })), {
      onSuccess: (ops) => {
        const ok = ops.filter((o) => o.status === 'completed').length
        const bad = ops.length - ok
        notify({
          id: 'org-apply', type: bad ? 'warning' : 'success', autoDismissMs: bad ? undefined : 8000,
          content: bad
            ? `Moved ${ok} file${ok === 1 ? '' : 's'}; ${bad} not moved. The move history shows why.`
            : `Moved ${ok} file${ok === 1 ? '' : 's'}. You can undo any move from the history.`,
        })
        setSelected([])
      },
      onError: (e) => notify({ id: 'org-apply', type: 'error', header: "Couldn't move files", content: errorMessage(e) }),
      onSettled: () => setConfirming(false),
    })

  return (
    <div>
      <PageHeader
        title="Organizer"
        info={<InfoLink />}
        description={
          (source === 'root'
            ? 'Files sitting loose at the top level of your Drive, matched to the existing folder they most resemble.'
            : 'Files directly inside the chosen folder, matched to the existing folder they most resemble.') +
          ' Nothing moves until you choose files and confirm; every move can be undone.'
        }
        actions={source !== 'root' ? <Button to="/organizer">Back to top level</Button> : undefined}
      />
      <div className="flex flex-col gap-6">
        {!canMove && auth.data && (
          <Alert type="warning" header="Permission needed" action={<Button href={authService.upgradeUrl}>Allow moving files</Button>}>
            Moving files needs the same broader Google permission as cleanup. You can still review suggestions.
          </Alert>
        )}
        {suggestions.isError && <Alert type="error">{errorMessage(suggestions.error)}</Alert>}

        <Panel
          title="Suggested moves"
          counter={suggestions.data ? (selected.length ? `(${selected.length}/${all.length})` : `(${all.length})`) : undefined}
          description="Based on file type, dates and name patterns. Select a confidence to see why."
          actions={
            <>
              <Button disabled={!high.length} onClick={() => setSelected(high)}>Select high confidence ({high.length})</Button>
              <Button disabled={!selected.length} onClick={() => setSelected([])}>Clear</Button>
              <Button variant="primary" disabled={!canMove || !selected.length || tooMany} onClick={() => setConfirming(true)}>
                {selected.length ? `Move ${selected.length} file${selected.length === 1 ? '' : 's'}` : 'Move files'}
              </Button>
            </>
          }
          flush
        >
          <Toolbar pagination={<Pagination page={list.page} pages={list.pages} onChange={list.setPage} />} />
          <Table<Suggestion>
            items={list.items}
            trackBy={(i) => i.file.google_file_id}
            loading={suggestions.isPending}
            sort={list.sort}
            onSort={list.setSort}
            selection={{ selected, onChange: setSelected, label: (i) => `Select ${i.file.name}` }}
            columns={[
              {
                id: 'file', header: 'File', sortField: 'name',
                cell: (i) => (
                  <div className="flex flex-col gap-0.5">
                    <ExternalAnchor href={i.file.web_view_link}>{i.file.name}</ExternalAnchor>
                    <Secondary className="text-xs">Modified {formatDate(i.file.modified_time)}</Secondary>
                  </div>
                ),
              },
              { id: 'folder', header: 'Move to', sortField: 'folder_name', cell: (i) => <AppLink to={`/files?folder=${encodeURIComponent(i.folder_id)}`}>{i.folder_name}</AppLink> },
              { id: 'confidence', header: 'Confidence', sortField: 'score', cell: (i) => <Confidence s={i} /> },
              { id: 'size', header: 'Size', sortField: 'size', align: 'right', cell: (i) => formatBytes(i.file.size) },
            ]}
            empty={
              <EmptyState title="No confident suggestions">
                Folders need at least 5 files to be used as a destination, and a file must fit a folder&apos;s type and date range.
              </EmptyState>
            }
          />
        </Panel>
        {tooMany && <Alert type="info">At most {MAX_MOVES} files per move. Clear some and try again.</Alert>}

        <History canMove={canMove} />
      </div>

      <Modal
        visible={confirming}
        onDismiss={() => setConfirming(false)}
        header={`Move ${selected.length} file${selected.length === 1 ? '' : 's'}?`}
        footer={
          <>
            <Button variant="link" className="mr-2" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button variant="primary" loading={apply.isPending} onClick={run}>Move files</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <KeyValues
            columns={3}
            items={[
              { label: 'Files', value: <span className="font-semibold">{selected.length.toLocaleString()}</span> },
              { label: 'Into folders', value: <span className="font-semibold">{folders.toLocaleString()}</span> },
              { label: 'Size', value: <span className="font-semibold">{formatBytes(selected.reduce((s, i) => s + (i.file.size ?? 0), 0))}</span> },
            ]}
          />
          <p>Each file moves into the folder shown. Nothing is deleted, and any move can be undone from the history.</p>
        </div>
      </Modal>
    </div>
  )
}
