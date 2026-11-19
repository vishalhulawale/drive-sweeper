import { useCollection } from '@cloudscape-design/collection-hooks'
import Alert from '@cloudscape-design/components/alert'
import Badge from '@cloudscape-design/components/badge'
import Box from '@cloudscape-design/components/box'
import Button from '@cloudscape-design/components/button'
import ContentLayout from '@cloudscape-design/components/content-layout'
import Header from '@cloudscape-design/components/header'
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs'
import Link from '@cloudscape-design/components/link'
import Modal from '@cloudscape-design/components/modal'
import Pagination from '@cloudscape-design/components/pagination'
import Popover from '@cloudscape-design/components/popover'
import SpaceBetween from '@cloudscape-design/components/space-between'
import Table from '@cloudscape-design/components/table'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import EmptyState from '../components/common/EmptyState'
import InfoLink from '../components/common/InfoLink'
import { AppButtonLink, AppLink } from '../components/common/RouterLink'
import { OperationStatusIndicator } from '../components/common/status'
import { useAuthStatus } from '../hooks/useGoogleDrive'
import { useApplyMoves, useOrganizerHistory, useSuggestions, useUndoMove } from '../hooks/useOrganizer'
import { useNotify } from '../layouts/notifications'
import { errorMessage } from '../services/api'
import { authService } from '../services/authService'
import type { Operation } from '../types/cleanup'
import type { Suggestion } from '../types/organizer'
import { formatBytes, formatDate } from '../utils/format'

const MAX_MOVES = 200
const paginationLabels = { nextPageLabel: 'Next page', previousPageLabel: 'Previous page', pageLabel: (n: number) => `Page ${n}` }

function Confidence({ s }: { s: Suggestion }) {
  return (
    <Popover
      size="medium"
      header="Why this folder"
      triggerType="custom"
      content={<ul style={{ margin: 0, paddingLeft: 18 }}>{s.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
    >
      <Button variant="inline-link" ariaLabel={`${s.confidence} confidence, ${Math.round(s.score * 100)}%. Show reasons.`}>
        <SpaceBetween direction="horizontal" size="xxs" alignItems="center">
          <Badge color={s.confidence === 'high' ? 'green' : 'grey'}>{s.confidence === 'high' ? 'High' : 'Medium'}</Badge>
          <span data-numeric>{Math.round(s.score * 100)}%</span>
        </SpaceBetween>
      </Button>
    </Popover>
  )
}

function History({ canMove }: { canMove: boolean }) {
  const history = useOrganizerHistory()
  const undo = useUndoMove()
  const { notify } = useNotify()
  const { items, collectionProps, paginationProps } = useCollection(history.data ?? [], {
    pagination: { pageSize: 25 },
    filtering: { empty: <EmptyState title="No moves yet">Files you move here are listed, and each move can be undone.</EmptyState> },
  })

  const undoOne = (o: Operation) =>
    undo.mutate(o.id, {
      onSuccess: () => notify({ id: `undo-${o.id}`, type: 'success', autoDismissMs: 6000, content: `Moved ${o.file_name} back.` }),
      onError: (e) => notify({ id: `undo-${o.id}`, type: 'error', header: `Couldn't undo the move of ${o.file_name}`, content: errorMessage(e) }),
    })

  return (
    <Table<Operation>
      {...collectionProps}
      trackBy="id"
      items={items}
      loading={history.isPending}
      loadingText="Loading move history"
      header={<Header counter={history.data ? `(${history.data.length.toLocaleString()})` : undefined}>Move history</Header>}
      pagination={<Pagination {...paginationProps} ariaLabels={paginationLabels} />}
      columnDefinitions={[
        { id: 'when', header: 'When', cell: (o) => formatDate(o.completed_at ?? o.created_at) },
        { id: 'action', header: 'Action', cell: (o) => (o.operation_type === 'unmove' ? 'Move undone' : 'Moved to folder') },
        {
          id: 'file', header: 'File', isRowHeader: true,
          cell: (o) => (
            <SpaceBetween size="xxxs">
              <span>{o.file_name}</span>
              {o.file_deleted && <Box fontSize="body-s" color="text-body-secondary">Deleted from Drive</Box>}
              {o.error_message && <Box fontSize="body-s" color="text-status-error">{o.error_message}</Box>}
            </SpaceBetween>
          ),
        },
        { id: 'status', header: 'Status', cell: (o) => <OperationStatusIndicator status={o.status} /> },
        {
          id: 'undo', header: '',
          cell: (o) => o.operation_type === 'move' && o.status === 'completed' && !o.file_deleted && (
            <Button variant="inline-link" disabled={!canMove || undo.isPending} onClick={() => undoOne(o)} ariaLabel={`Undo move of ${o.file_name}`}>
              Undo
            </Button>
          ),
        },
      ]}
    />
  )
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
  const { items, collectionProps, paginationProps } = useCollection(all, {
    pagination: { pageSize: 50 },
    sorting: { defaultState: { sortingColumn: { sortingField: 'score' }, isDescending: true } },
    filtering: {
      empty: (
        <EmptyState title="No confident suggestions">
          Folders need at least 5 files to be used as a destination, and a file must fit a folder&apos;s type and date range.
        </EmptyState>
      ),
    },
  })
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
    <ContentLayout
      header={
        <Header
          variant="h1"
          info={<InfoLink />}
          description={
            (source === 'root'
              ? 'Files sitting loose at the top level of your Drive, matched to the existing folder they most resemble.'
              : 'Files directly inside the chosen folder, matched to the existing folder they most resemble.') +
            ' Nothing moves until you choose files and confirm; every move can be undone.'
          }
          actions={source !== 'root' ? <AppButtonLink href="/organizer">Back to top level</AppButtonLink> : undefined}
        >
          Organizer
        </Header>
      }
    >
      <SpaceBetween size="l">
        {!canMove && auth.data && (
          <Alert type="warning" header="Permission needed" action={<Button href={authService.upgradeUrl}>Allow moving files</Button>}>
            Moving files needs the same broader Google permission as cleanup. You can still review suggestions.
          </Alert>
        )}
        {suggestions.isError && <Alert type="error">{errorMessage(suggestions.error)}</Alert>}

        <Table<Suggestion>
          {...collectionProps}
          trackBy={(i) => i.file.google_file_id}
          items={items}
          loading={suggestions.isPending}
          loadingText="Matching files to folders"
          selectionType="multi"
          selectedItems={selected}
          onSelectionChange={(e) => setSelected(e.detail.selectedItems)}
          ariaLabels={{
            selectionGroupLabel: 'Suggestion selection',
            itemSelectionLabel: (_, i) => `Select ${i.file.name}`,
            allItemsSelectionLabel: () => 'Select all on this page',
          }}
          header={
            <Header
              counter={suggestions.data ? (selected.length ? `(${selected.length}/${all.length})` : `(${all.length})`) : undefined}
              description="Based on file type, dates and name patterns. Select a confidence to see why."
              actions={
                <SpaceBetween direction="horizontal" size="xs">
                  <Button disabled={!high.length} onClick={() => setSelected(high)}>Select high confidence ({high.length})</Button>
                  <Button disabled={!selected.length} onClick={() => setSelected([])}>Clear</Button>
                  <Button variant="primary" disabled={!canMove || !selected.length || tooMany} onClick={() => setConfirming(true)}>
                    {selected.length ? `Move ${selected.length} file${selected.length === 1 ? '' : 's'}` : 'Move files'}
                  </Button>
                </SpaceBetween>
              }
            >
              Suggested moves
            </Header>
          }
          pagination={<Pagination {...paginationProps} ariaLabels={paginationLabels} />}
          columnDefinitions={[
            {
              id: 'file', header: 'File', isRowHeader: true, sortingField: 'name',
              sortingComparator: (a, b) => a.file.name.localeCompare(b.file.name),
              cell: (i) => (
                <SpaceBetween size="xxxs">
                  <Link href={i.file.web_view_link ?? undefined} external externalIconAriaLabel="(opens in Google Drive)">{i.file.name}</Link>
                  <Box fontSize="body-s" color="text-body-secondary">Modified {formatDate(i.file.modified_time)}</Box>
                </SpaceBetween>
              ),
            },
            {
              id: 'folder', header: 'Move to', sortingField: 'folder_name',
              cell: (i) => <AppLink href={`/files?folder=${encodeURIComponent(i.folder_id)}`}>{i.folder_name}</AppLink>,
            },
            { id: 'confidence', header: 'Confidence', sortingField: 'score', cell: (i) => <Confidence s={i} /> },
            {
              id: 'size', header: 'Size', sortingField: 'size',
              sortingComparator: (a, b) => (a.file.size ?? 0) - (b.file.size ?? 0),
              cell: (i) => formatBytes(i.file.size),
            },
          ]}
        />
        {tooMany && <Alert type="info">At most {MAX_MOVES} files per move. Clear some and try again.</Alert>}

        <History canMove={canMove} />
      </SpaceBetween>

      <Modal
        visible={confirming}
        onDismiss={() => setConfirming(false)}
        header={`Move ${selected.length} file${selected.length === 1 ? '' : 's'}?`}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setConfirming(false)}>Cancel</Button>
              <Button variant="primary" loading={apply.isPending} onClick={run}>Move files</Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <KeyValuePairs
            columns={3}
            items={[
              { label: 'Files', value: selected.length.toLocaleString() },
              { label: 'Into folders', value: folders.toLocaleString() },
              { label: 'Size', value: formatBytes(selected.reduce((s, i) => s + (i.file.size ?? 0), 0)) },
            ]}
          />
          <Box variant="p">Each file moves into the folder shown. Nothing is deleted, and any move can be undone from the history.</Box>
        </SpaceBetween>
      </Modal>
    </ContentLayout>
  )
}
