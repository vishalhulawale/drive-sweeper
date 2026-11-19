import { useCollection } from '@cloudscape-design/collection-hooks'
import Alert from '@cloudscape-design/components/alert'
import Box from '@cloudscape-design/components/box'
import Button from '@cloudscape-design/components/button'
import ContentLayout from '@cloudscape-design/components/content-layout'
import ExpandableSection from '@cloudscape-design/components/expandable-section'
import Header from '@cloudscape-design/components/header'
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs'
import Link from '@cloudscape-design/components/link'
import Modal from '@cloudscape-design/components/modal'
import Pagination from '@cloudscape-design/components/pagination'
import SpaceBetween from '@cloudscape-design/components/space-between'
import Table from '@cloudscape-design/components/table'
import TextFilter from '@cloudscape-design/components/text-filter'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import EmptyState from '../components/common/EmptyState'
import InfoLink from '../components/common/InfoLink'
import { AppButtonLink } from '../components/common/RouterLink'
import { OperationStatusIndicator } from '../components/common/status'
import {
  useCleanupPlan, useCleanupStatus, useExecuteCleanup, useOperations, useRestore,
} from '../hooks/useCleanup'
import { useAuthStatus } from '../hooks/useGoogleDrive'
import { useNotify } from '../layouts/notifications'
import { errorMessage } from '../services/api'
import { authService } from '../services/authService'
import type { Operation, PlanItem } from '../types/cleanup'
import { formatBytes, formatDate } from '../utils/format'

const ACTION_TEXT: Record<Operation['operation_type'], string> = {
  trash: 'Moved to Trash', restore: 'Restored', move: 'Moved to folder', unmove: 'Move undone',
}

const paginationLabels = { nextPageLabel: 'Next page', previousPageLabel: 'Previous page', pageLabel: (n: number) => `Page ${n}` }

function ReadyTable({ items, loading }: { items: PlanItem[]; loading: boolean }) {
  const { items: shown, collectionProps, filterProps, paginationProps, filteredItemsCount } = useCollection(items, {
    filtering: {
      filteringFunction: (i, text) => {
        const t = text.toLowerCase()
        return i.file.name.toLowerCase().includes(t) || i.keeper_name.toLowerCase().includes(t)
      },
      empty: (
        <EmptyState
          title="Nothing marked for Trash"
          action={<SpaceBetween direction="horizontal" size="xs"><AppButtonLink href="/duplicates">Review duplicates</AppButtonLink><AppButtonLink href="/similar">Review similar photos</AppButtonLink></SpaceBetween>}
        >
          Mark files as Trash on the Duplicates or Similar photos page, then come back here.
        </EmptyState>
      ),
      noMatch: <EmptyState title="No matching files">No file or kept copy matches that text.</EmptyState>,
    },
    sorting: { defaultState: { sortingColumn: { sortingField: 'size' }, isDescending: true } },
    pagination: { pageSize: 50 },
  })

  return (
    <Table<PlanItem>
      {...collectionProps}
      trackBy={(i) => i.file.google_file_id}
      items={shown}
      loading={loading}
      loadingText="Loading marked files"
      header={<Header counter={`(${items.length.toLocaleString()})`} description="Each file is checked against Drive before it moves, so the copy you keep is never lost.">Ready to move to Trash</Header>}
      filter={
        <TextFilter
          {...filterProps}
          filteringPlaceholder="Find a file"
          filteringAriaLabel="Filter marked files"
          countText={filterProps.filteringText ? `${filteredItemsCount} match${filteredItemsCount === 1 ? '' : 'es'}` : undefined}
        />
      }
      pagination={<Pagination {...paginationProps} ariaLabels={paginationLabels} />}
      columnDefinitions={[
        {
          id: 'file', header: 'File to trash', isRowHeader: true, sortingField: 'name',
          sortingComparator: (a, b) => a.file.name.localeCompare(b.file.name),
          cell: (i) => <Link href={i.file.web_view_link ?? undefined} external externalIconAriaLabel="(opens in Google Drive)">{i.file.name}</Link>,
        },
        { id: 'keeper', header: 'Copy you keep', cell: (i) => i.keeper_name, sortingComparator: (a, b) => a.keeper_name.localeCompare(b.keeper_name) },
        {
          id: 'size', header: 'Size', sortingField: 'size',
          sortingComparator: (a, b) => (a.file.size ?? 0) - (b.file.size ?? 0),
          cell: (i) => formatBytes(i.file.size),
        },
      ]}
    />
  )
}

function History({ canTrash }: { canTrash: boolean }) {
  const status = useCleanupStatus()
  const ops = useOperations(status.data?.running ?? false)
  const restore = useRestore()
  const { notify } = useNotify()
  const [selected, setSelected] = useState<Operation[]>([])
  const restorable = (o: Operation) => o.operation_type === 'trash' && o.status === 'completed' && !o.file_deleted

  const { items: shown, collectionProps, filterProps, paginationProps, filteredItemsCount } = useCollection(ops.data ?? [], {
    filtering: {
      filteringFunction: (o, text) => o.file_name.toLowerCase().includes(text.toLowerCase()),
      empty: <EmptyState title="No cleanup actions yet">Files you move to Trash here are listed, and can be restored.</EmptyState>,
      noMatch: <EmptyState title="No matching files" />,
    },
    pagination: { pageSize: 25 },
  })

  const restoreMany = async (list: Operation[]) => {
    let ok = 0
    for (const o of list) {
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
    <Table<Operation>
      {...collectionProps}
      trackBy="id"
      items={shown}
      loading={ops.isPending}
      loadingText="Loading history"
      selectionType="multi"
      selectedItems={selected}
      onSelectionChange={(e) => setSelected(e.detail.selectedItems)}
      isItemDisabled={(o) => !restorable(o)}
      ariaLabels={{
        selectionGroupLabel: 'History selection',
        itemSelectionLabel: (_, o) => `Select ${o.file_name}`,
        allItemsSelectionLabel: () => 'Select all on this page',
      }}
      header={
        <Header
          counter={ops.data ? `(${ops.data.length.toLocaleString()})` : undefined}
          actions={
            <Button disabled={!canTrash || !chosen.length} loading={restore.isPending} onClick={() => restoreMany(chosen)}>
              {chosen.length ? `Restore ${chosen.length} selected` : 'Restore selected'}
            </Button>
          }
        >
          History
        </Header>
      }
      filter={
        <TextFilter
          {...filterProps}
          filteringPlaceholder="Find a file"
          filteringAriaLabel="Filter history"
          countText={filterProps.filteringText ? `${filteredItemsCount} match${filteredItemsCount === 1 ? '' : 'es'}` : undefined}
        />
      }
      pagination={<Pagination {...paginationProps} ariaLabels={paginationLabels} />}
      columnDefinitions={[
        { id: 'when', header: 'When', cell: (o) => formatDate(o.completed_at ?? o.created_at) },
        { id: 'action', header: 'Action', cell: (o) => ACTION_TEXT[o.operation_type] ?? o.operation_type },
        {
          id: 'file', header: 'File', isRowHeader: true,
          cell: (o) => (
            <SpaceBetween size="xxxs">
              {o.web_view_link && !o.file_deleted
                ? <Link href={o.web_view_link} external externalIconAriaLabel="(opens in Google Drive)">{o.file_name}</Link>
                : o.file_name}
              {o.file_deleted && <Box fontSize="body-s" color="text-body-secondary">Deleted from Drive</Box>}
              {o.error_message && <Box fontSize="body-s" color="text-status-error">{o.error_message}</Box>}
            </SpaceBetween>
          ),
        },
        { id: 'size', header: 'Size', cell: (o) => formatBytes(o.file_size) },
        { id: 'status', header: 'Status', cell: (o) => <OperationStatusIndicator status={o.status} /> },
        {
          id: 'restore', header: '',
          cell: (o) => restorable(o) && (
            <Button variant="inline-link" disabled={!canTrash || restore.isPending} onClick={() => restoreMany([o])} ariaLabel={`Restore ${o.file_name}`}>
              Restore
            </Button>
          ),
        },
      ]}
    />
  )
}

export default function Cleanup() {
  const auth = useAuthStatus()
  const plan = useCleanupPlan()
  const status = useCleanupStatus()
  const execute = useExecuteCleanup()
  const { notify } = useNotify()
  const running = status.data?.running ?? false
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
    <ContentLayout
      header={
        <Header
          variant="h1"
          info={<InfoLink />}
          description="Files you marked for Trash. They go to Google Drive's Trash, where you can restore them for 30 days."
          actions={
            <Button
              variant="primary"
              disabled={!canTrash || count === 0 || tooMany || running}
              onClick={() => setConfirming(true)}
            >
              {count ? `Move ${count.toLocaleString()} file${count === 1 ? '' : 's'} to Trash` : 'Move to Trash'}
            </Button>
          }
        >
          Cleanup
        </Header>
      }
    >
      <SpaceBetween size="l">
        {!canTrash && auth.data && (
          <Alert type="warning" header="Permission needed" action={<Button href={authService.upgradeUrl}>Allow moving to Trash</Button>}>
            Moving files to Trash needs a broader Google permission than scanning. Nothing is deleted permanently.
          </Alert>
        )}
        {plan.isError && <Alert type="error">{errorMessage(plan.error)}</Alert>}
        {tooMany && (
          <Alert type="info">At most {p?.max_batch.toLocaleString()} files per run. Unmark some files and run again.</Alert>
        )}
        {p && p.blocked.length > 0 && (
          <Alert type="warning" header={`${p.blocked.length} group${p.blocked.length === 1 ? '' : 's'} can't be cleaned up as marked`}>
            <ExpandableSection headerText="Show the reasons" variant="footer">
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {p.blocked.map((b) => <li key={b.group_id}>Group {b.group_id}: {b.reason}</li>)}
              </ul>
            </ExpandableSection>
          </Alert>
        )}
        <ReadyTable items={p?.items ?? []} loading={plan.isPending} />
        <History canTrash={canTrash} />
      </SpaceBetween>

      <Modal
        visible={confirming}
        onDismiss={() => setConfirming(false)}
        header={`Move ${count.toLocaleString()} file${count === 1 ? '' : 's'} to Trash?`}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setConfirming(false)}>Cancel</Button>
              <Button variant="primary" loading={execute.isPending} onClick={run}>Move to Trash</Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <KeyValuePairs
            columns={3}
            items={[
              { label: 'Files', value: count.toLocaleString() },
              { label: 'Size', value: formatBytes(p?.bytes) },
              { label: 'Groups', value: groupCount.toLocaleString() },
            ]}
          />
          <Box variant="p">
            The files move to your Google Drive Trash. The copy you keep in each group is checked against Drive first.
            Large selections run in the background; you can cancel the rest and restore any file from the history.
          </Box>
        </SpaceBetween>
      </Modal>
    </ContentLayout>
  )
}
