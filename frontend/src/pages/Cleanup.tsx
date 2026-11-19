import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import EmptyState from '../components/common/EmptyState'
import InfoLink from '../components/common/InfoLink'
import { OperationStatusIndicator } from '../components/common/status'
import { Alert, Button, ExternalAnchor, KeyValues, PageHeader, Panel, SearchInput, Secondary } from '../components/ui/core'
import { Modal } from '../components/ui/overlay'
import { Pagination, Table, Toolbar, useCollection } from '../components/ui/table'
import {
  useCleanupPlan, useCleanupStatus, useExecuteCleanup, useOperations, useRestore,
} from '../hooks/useCleanup'
import { useAuthStatus } from '../hooks/useGoogleDrive'
import { useSyncOnOpen } from '../hooks/useSync'
import { useNotify } from '../layouts/notifications'
import { errorMessage } from '../services/api'
import { authService } from '../services/authService'
import type { Operation, PlanItem } from '../types/cleanup'
import { formatBytes, formatDate } from '../utils/format'

const ACTION_TEXT: Record<Operation['operation_type'], string> = {
  trash: 'Moved to Trash', restore: 'Restored', move: 'Moved to folder', unmove: 'Move undone',
}

const matches = (n: number) => `${n} match${n === 1 ? '' : 'es'}`

const PLAN_COMPARE = {
  name: (a: PlanItem, b: PlanItem) => a.file.name.localeCompare(b.file.name),
  keeper: (a: PlanItem, b: PlanItem) => a.keeper_name.localeCompare(b.keeper_name),
  size: (a: PlanItem, b: PlanItem) => (a.file.size ?? 0) - (b.file.size ?? 0),
}
const planFilter = (i: PlanItem, text: string) => {
  const t = text.toLowerCase()
  return i.file.name.toLowerCase().includes(t) || i.keeper_name.toLowerCase().includes(t)
}

function ReadyTable({ items, loading }: { items: PlanItem[]; loading: boolean }) {
  const list = useCollection(items, { pageSize: 50, filter: planFilter, sort: { field: 'size', desc: true }, comparators: PLAN_COMPARE })

  return (
    <Panel
      title="Ready to move to Trash"
      counter={`(${items.length.toLocaleString()})`}
      description="Each file is checked against Drive before it moves, so the copy you keep is never lost."
      flush
    >
      <Toolbar pagination={<Pagination page={list.page} pages={list.pages} onChange={list.setPage} />}>
        <SearchInput value={list.text} onChange={list.setText} placeholder="Find a file" ariaLabel="Filter marked files" className="w-full max-w-sm" />
        {list.text && <Secondary>{matches(list.filteredCount)}</Secondary>}
      </Toolbar>
      <Table<PlanItem>
        items={list.items}
        trackBy={(i) => i.file.google_file_id}
        loading={loading}
        sort={list.sort}
        onSort={list.setSort}
        columns={[
          { id: 'file', header: 'File to trash', sortField: 'name', cell: (i) => <ExternalAnchor href={i.file.web_view_link}>{i.file.name}</ExternalAnchor> },
          { id: 'keeper', header: 'Copy you keep', sortField: 'keeper', cell: (i) => <span className="text-emerald-700 dark:text-emerald-400">{i.keeper_name}</span> },
          { id: 'size', header: 'Size', sortField: 'size', align: 'right', cell: (i) => formatBytes(i.file.size) },
        ]}
        empty={
          list.text ? <EmptyState title="No matching files">No file or kept copy matches that text.</EmptyState> : (
            <EmptyState
              title="Nothing marked for Trash"
              action={<><Button to="/duplicates">Review duplicates</Button><Button to="/similar">Review similar photos</Button></>}
            >
              Mark files as Trash on the Duplicates or Similar photos page, then come back here.
            </EmptyState>
          )
        }
      />
    </Panel>
  )
}

const opFilter = (o: Operation, text: string) => o.file_name.toLowerCase().includes(text.toLowerCase())

function History({ canTrash }: { canTrash: boolean }) {
  const status = useCleanupStatus()
  const ops = useOperations(status.data?.running ?? false)
  const restore = useRestore()
  const { notify } = useNotify()
  const [selected, setSelected] = useState<Operation[]>([])
  const restorable = (o: Operation) => o.operation_type === 'trash' && o.status === 'completed' && !o.file_deleted
  const list = useCollection(ops.data ?? [], { pageSize: 25, filter: opFilter })

  const restoreMany = async (items: Operation[]) => {
    let ok = 0
    for (const o of items) {
      try {
        await restore.mutateAsync(o.id)
        ok++
      } catch (e) {
        notify({ id: `restore-${o.id}`, type: 'error', header: `Couldn't restore ${o.file_name}`, content: errorMessage(e) })
      }
    }
    setSelected([])
    if (ok) notify({ id: 'restore', type: 'success', autoDismissMs: 8000, content: `Restored ${ok.toLocaleString()} file${ok === 1 ? '' : 's'} from Trash.` })
  }

  const chosen = selected.filter(restorable)

  return (
    <Panel
      title="History"
      counter={ops.data ? `(${ops.data.length.toLocaleString()})` : undefined}
      actions={
        <Button disabled={!canTrash || !chosen.length} loading={restore.isPending} onClick={() => restoreMany(chosen)}>
          {chosen.length ? `Restore ${chosen.length} selected` : 'Restore selected'}
        </Button>
      }
      flush
    >
      <Toolbar pagination={<Pagination page={list.page} pages={list.pages} onChange={list.setPage} />}>
        <SearchInput value={list.text} onChange={list.setText} placeholder="Find a file" ariaLabel="Filter history" className="w-full max-w-sm" />
        {list.text && <Secondary>{matches(list.filteredCount)}</Secondary>}
      </Toolbar>
      <Table<Operation>
        items={list.items}
        trackBy={(o) => o.id}
        loading={ops.isPending}
        selection={{ selected, onChange: setSelected, isDisabled: (o) => !restorable(o), label: (o) => `Select ${o.file_name}` }}
        columns={[
          { id: 'when', header: 'When', className: 'whitespace-nowrap', cell: (o) => formatDate(o.completed_at ?? o.created_at) },
          { id: 'action', header: 'Action', cell: (o) => ACTION_TEXT[o.operation_type] ?? o.operation_type },
          {
            id: 'file', header: 'File',
            cell: (o) => (
              <div className="flex flex-col gap-0.5">
                {o.web_view_link && !o.file_deleted ? <ExternalAnchor href={o.web_view_link}>{o.file_name}</ExternalAnchor> : <span>{o.file_name}</span>}
                {o.file_deleted && <Secondary className="text-xs">Deleted from Drive</Secondary>}
                {o.error_message && <span className="text-xs text-rose-600">{o.error_message}</span>}
              </div>
            ),
          },
          { id: 'size', header: 'Size', align: 'right', cell: (o) => formatBytes(o.file_size) },
          { id: 'status', header: 'Status', cell: (o) => <OperationStatusIndicator status={o.status} /> },
          {
            id: 'restore', header: '',
            cell: (o) => restorable(o) && (
              <Button variant="link" disabled={!canTrash || restore.isPending} onClick={() => restoreMany([o])} ariaLabel={`Restore ${o.file_name}`}>Restore</Button>
            ),
          },
        ]}
        empty={list.text
          ? <EmptyState title="No matching files" />
          : <EmptyState title="No cleanup actions yet">Files you move to Trash here are listed, and can be restored.</EmptyState>}
      />
    </Panel>
  )
}

export default function Cleanup() {
  const auth = useAuthStatus()
  const plan = useCleanupPlan()
  const status = useCleanupStatus()
  const execute = useExecuteCleanup()
  const { notify } = useNotify()
  const running = status.data?.running ?? false
  // Catch files deleted or changed directly in Drive; not during a run (wait until its status is known).
  const syncing = useSyncOnOpen(status.isPending || running)
  const [confirming, setConfirming] = useState(false)

  // Polling stops the moment the run ends, so the last poll can still show files as pending.
  // Refresh everything once when a run finishes.
  const qc = useQueryClient()
  const wasRunning = useRef(false)
  useEffect(() => {
    if (wasRunning.current && !running) {
      for (const key of ['cleanup-ops', 'cleanup-plan', 'dup-groups', 'dup-summary', 'files', 'summary', 'trash-overview', 'trash-items']) {
        qc.invalidateQueries({ queryKey: [key] })
      }
    }
    wasRunning.current = running
  }, [running, qc])

  const canTrash = auth.data?.can_trash ?? false
  const p = plan.data
  const count = p?.count ?? 0
  const tooMany = p ? count > p.max_batch : false
  const groupCount = new Set(p?.items.map((i) => i.group_id)).size

  const run = () =>
    execute.mutate(count, {
      onSuccess: () => notify({ id: 'cleanup-start', type: 'info', autoDismissMs: 5000, content: `Moving ${count.toLocaleString()} files to Trash. Progress shows at the top of every page.` }),
      onError: (e) => notify({ id: 'cleanup-start', type: 'error', header: "Couldn't start moving files to Trash", content: errorMessage(e) }),
      onSettled: () => setConfirming(false),
    })

  return (
    <div>
      <PageHeader
        title="Cleanup"
        info={<InfoLink />}
        description="Files you marked for Trash. They go to Google Drive's Trash, where you can restore them for 30 days."
        actions={
          <Button variant="primary" loading={syncing} disabled={!canTrash || count === 0 || tooMany || running || syncing} onClick={() => setConfirming(true)}>
            {count ? `Move ${count.toLocaleString()} file${count === 1 ? '' : 's'} to Trash` : 'Move to Trash'}
          </Button>
        }
      />
      <div className="flex flex-col gap-6">
        {!canTrash && auth.data && (
          <Alert type="warning" header="Permission needed" action={<Button href={authService.upgradeUrl}>Allow moving to Trash</Button>}>
            Moving files to Trash needs a broader Google permission than scanning. Nothing is deleted permanently.
          </Alert>
        )}
        {plan.isError && <Alert type="error">{errorMessage(plan.error)}</Alert>}
        {tooMany && <Alert type="info">At most {p?.max_batch.toLocaleString()} files per run. Unmark some files and run again.</Alert>}
        {p && p.blocked.length > 0 && (
          <Alert type="warning" header={`${p.blocked.length} group${p.blocked.length === 1 ? '' : 's'} can't be cleaned up as marked`}>
            <details>
              <summary className="cursor-pointer font-semibold text-brand-600 dark:text-brand-500">Show the reasons</summary>
              <ul className="mt-1 list-disc pl-5">
                {p.blocked.map((b) => <li key={b.group_id}>Group {b.group_id}: {b.reason}</li>)}
              </ul>
            </details>
          </Alert>
        )}
        <ReadyTable items={p?.items ?? []} loading={plan.isPending} />
        <History canTrash={canTrash} />
      </div>

      <Modal
        visible={confirming}
        onDismiss={() => setConfirming(false)}
        header={`Move ${count.toLocaleString()} file${count === 1 ? '' : 's'} to Trash?`}
        footer={
          <>
            <Button variant="link" className="mr-2" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button variant="primary" loading={execute.isPending} onClick={run}>Move to Trash</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <KeyValues
            columns={3}
            items={[
              { label: 'Files', value: <span className="font-semibold">{count.toLocaleString()}</span> },
              { label: 'Size', value: <span className="font-semibold">{formatBytes(p?.bytes)}</span> },
              { label: 'Groups', value: <span className="font-semibold">{groupCount.toLocaleString()}</span> },
            ]}
          />
          <p>
            The files move to your Google Drive Trash. The copy you keep in each group is checked against Drive first.
            Large selections run in the background; you can cancel the rest and restore any file from the history.
          </p>
        </div>
      </Modal>
    </div>
  )
}
