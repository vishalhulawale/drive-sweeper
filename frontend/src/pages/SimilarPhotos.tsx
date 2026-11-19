import Alert from '@cloudscape-design/components/alert'
import Box from '@cloudscape-design/components/box'
import Button from '@cloudscape-design/components/button'
import ButtonDropdown from '@cloudscape-design/components/button-dropdown'
import Container from '@cloudscape-design/components/container'
import ContentLayout from '@cloudscape-design/components/content-layout'
import Header from '@cloudscape-design/components/header'
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs'
import Modal from '@cloudscape-design/components/modal'
import Pagination from '@cloudscape-design/components/pagination'
import ProgressBar from '@cloudscape-design/components/progress-bar'
import SpaceBetween from '@cloudscape-design/components/space-between'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import EmptyState from '../components/common/EmptyState'
import InfoLink from '../components/common/InfoLink'
import { AppButtonLink } from '../components/common/RouterLink'
import { ContainerSkeleton } from '../components/loading/PageSkeleton'
import CompareModal from '../components/review/CompareModal'
import PhotoTile from '../components/review/PhotoTile'
import { useBulkApply } from '../components/review/useBulkApply'
import { useReviewShortcuts } from '../components/review/useReviewShortcuts'
import { useCleanupPlan } from '../hooks/useCleanup'
import { useDuplicateGroups, usePrefetchGroups, useRestoreSelections, useSelectAction } from '../hooks/useDuplicates'
import { useCancelNear, useNearStatus, useRegroupNear, useStartNear } from '../hooks/useNear'
import { useHelp } from '../layouts/help'
import { useNotify } from '../layouts/notifications'
import { errorMessage } from '../services/api'
import { nearService, type NearStatus } from '../services/nearService'
import type { DuplicatePage, DuplicateGroup } from '../types/duplicate'
import { formatBytes } from '../utils/format'

const PAGE_SIZE = 10

function Analysis() {
  const status = useNearStatus()
  const start = useStartNear()
  const cancel = useCancelNear()
  const regroup = useRegroupNear()
  const { notify } = useNotify()
  const s = status.data
  const done = s ? s.eligible - s.pending : 0
  const err = status.error ?? start.error ?? cancel.error ?? regroup.error

  const startLabel = s && s.pending === 0 && s.eligible > 0 ? 'Check for new photos' : done > 0 ? 'Resume analysis' : 'Analyse photos'
  const actions = s?.running ? (
    <Button onClick={() => cancel.mutate()} loading={cancel.isPending}>Stop</Button>
  ) : (
    <SpaceBetween direction="horizontal" size="xs">
      <ButtonDropdown
        variant="icon"
        ariaLabel="More analysis actions"
        disabled={!s?.hashed}
        items={[{ id: 'regroup', text: 'Group again with current settings', description: 'Rebuilds groups from photos already analysed' }]}
        onItemClick={() =>
          regroup.mutate(undefined, {
            onSuccess: (r) => notify({ id: 'near-regroup', type: 'success', autoDismissMs: 8000, content: `Grouped again: ${(r as NearStatus).groups.toLocaleString()} groups of similar photos.` }),
          })
        }
      />
      <Button onClick={() => start.mutate()} loading={start.isPending} disabled={!s || s.eligible === 0}>{startLabel}</Button>
    </SpaceBetween>
  )

  return (
    <Container header={<Header variant="h2" actions={actions} info={<InfoLink />}>Analysis</Header>}>
      <SpaceBetween size="m">
        {err != null && <Alert type="error">{errorMessage(err)}</Alert>}
        {s?.last_error && !s.running && <Alert type="warning">Last analysis stopped: {s.last_error}</Alert>}
        {s?.running ? (
          <ProgressBar
            label="Analysing photos"
            value={s.eligible ? (done / s.eligible) * 100 : 0}
            description={`${done.toLocaleString()} of ${s.eligible.toLocaleString()} photos analysed`}
            additionalInfo="Reads a small preview of each photo from Google, never the original."
          />
        ) : (
          <KeyValuePairs
            columns={4}
            items={[
              { label: 'Photos analysed', value: s ? `${done.toLocaleString()} of ${s.eligible.toLocaleString()}` : '—' },
              { label: "Couldn't be read", value: s ? s.unhashable.toLocaleString() : '—' },
              { label: 'Groups found', value: s ? s.groups.toLocaleString() : '—' },
              { label: 'You can free', value: s ? `Up to ${formatBytes(s.potential_savings)}` : '—' },
            ]}
          />
        )}
      </SpaceBetween>
    </Container>
  )
}

function Group({
  group, focused, onFocus, onCompare, onApply, onKeepAll, applying,
}: {
  group: DuplicateGroup
  /** Set only when the keyboard moved here (J / K), so page load doesn't scroll. */
  focused: boolean
  onFocus: () => void
  onCompare: () => void
  onApply: () => void
  onKeepAll: () => void
  applying: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (focused && ref.current && !ref.current.contains(document.activeElement)) {
      ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      ref.current.querySelector<HTMLElement>('[data-photo-tile] button')?.focus({ preventScroll: true })
    }
  }, [focused])
  const marked = group.files.filter((e) => e.user_selected_action === 'trash').length

  return (
    <div ref={ref} onFocusCapture={onFocus}>
      <Container
        header={
          <Header
            variant="h2"
            counter={marked ? `(${marked} marked for Trash)` : undefined}
            description={`Save up to ${formatBytes(group.potential_savings)}`}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button onClick={onCompare}>Compare</Button>
                <Button onClick={onKeepAll}>Keep all</Button>
                <Button onClick={onApply} loading={applying}>Keep only the suggested copy</Button>
              </SpaceBetween>
            }
          >
            {group.file_count} similar photos
          </Header>
        }
      >
        <div className="dc-photo-grid">
          {group.files.map((e) => <PhotoTile key={e.entry_id} entry={e} />)}
        </div>
      </Container>
    </div>
  )
}

export default function SimilarPhotos() {
  const [page, setPageState] = useState(1)
  const [focus, setFocus] = useState(0)
  const [keyboardMoved, setKeyboardMoved] = useState(false)
  const setPage = (p: number) => { setPageState(p); setFocus(0) }
  const [comparing, setComparing] = useState<number | null>(null)
  const [confirmAll, setConfirmAll] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const status = useNearStatus()
  const groups = useDuplicateGroups('savings', page, PAGE_SIZE, 'near')
  const plan = useCleanupPlan()
  const bulk = useBulkApply('near')
  const select = useSelectAction()
  const restore = useRestoreSelections()
  const prefetch = usePrefetchGroups()
  const qc = useQueryClient()
  const { openHelp } = useHelp()

  const items = useMemo(() => groups.data?.items ?? [], [groups.data])
  const total = groups.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const s = status.data
  const marked = plan.data?.count ?? 0

  // Prefetch the next page and its previews so "next" is instant.
  useEffect(() => {
    if (page >= pages) return
    prefetch('savings', page + 1, PAGE_SIZE, 'near').then(() => {
      const next = qc.getQueryData<DuplicatePage>(['dup-groups', 'near', 'savings', page + 1, PAGE_SIZE])
      next?.items.forEach((g) => g.files.forEach((e) => { new Image().src = nearService.thumbnailUrl(e.file.google_file_id) }))
    })
  }, [page, pages, prefetch, qc])

  const keepAll = useCallback((g: DuplicateGroup) =>
    restore.mutate(g.files.map((e) => ({ entryId: e.entry_id, action: 'keep' as const }))), [restore])

  const moveFocus = useCallback((d: number) => {
    setKeyboardMoved(true)
    const n = focus + d
    if (n >= 0 && n < items.length) setFocus(n)
    else if (n >= items.length && page < pages) setPage(page + 1)
    else if (n < 0 && page > 1) setPage(page - 1)
  }, [focus, items.length, page, pages])

  const shortcuts = useMemo(() => ({
    next: () => moveFocus(1),
    previous: () => moveFocus(-1),
    keep: (id: number) => select.mutate({ entryId: id, action: 'keep' }),
    trash: (id: number) => select.mutate({ entryId: id, action: 'trash' }),
    applyToGroup: () => items[focus] && bulk.run([items[focus]]),
    compare: () => items[focus] && setComparing(focus),
    help: () => setShortcutsOpen(true),
  }), [moveFocus, select, items, focus, bulk])
  useReviewShortcuts(comparing === null && !confirmAll && !shortcutsOpen, shortcuts)

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          counter={s ? `(${s.groups.toLocaleString()})` : undefined}
          info={<InfoLink />}
          description="Photos that look the same but aren't identical files: resized, re-saved or lightly edited copies. Look at each group before you trash anything."
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button iconName="keyboard" onClick={() => setShortcutsOpen(true)} ariaLabel="Keyboard shortcuts" variant="icon" />
              <ButtonDropdown
                loading={bulk.isPending}
                disabled={!items.length}
                items={[
                  { id: 'page', text: `To this page (${items.length} groups)` },
                  { id: 'all', text: `To all ${total.toLocaleString()} groups…` },
                ]}
                onItemClick={({ detail }) => (detail.id === 'all' ? setConfirmAll(true) : bulk.run(items))}
              >
                Apply suggestions
              </ButtonDropdown>
              <AppButtonLink href="/cleanup" variant="primary" disabled={!marked}>
                {marked ? `Review ${marked.toLocaleString()} in Cleanup` : 'Review in Cleanup'}
              </AppButtonLink>
            </SpaceBetween>
          }
        >
          Similar photos
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Analysis />
        {groups.isError && <Alert type="error">{errorMessage(groups.error)}</Alert>}
        {groups.isPending && <><ContainerSkeleton lines={4} /><ContainerSkeleton lines={4} /></>}
        {groups.data && total === 0 && (
          <Container>
            <EmptyState title={s && s.pending > 0 ? 'Analyse your photos to find similar ones' : 'No similar photos found'}>
              {s && s.pending > 0 ? 'Start the analysis above. It can be stopped and resumed.' : 'Every photo looks different from the others.'}
            </EmptyState>
          </Container>
        )}
        {total > 0 && (
          <Box float="right">
            <Pagination
              currentPageIndex={page}
              pagesCount={pages}
              onChange={(e) => setPage(e.detail.currentPageIndex)}
              ariaLabels={{ nextPageLabel: 'Next page', previousPageLabel: 'Previous page', pageLabel: (n) => `Page ${n}` }}
            />
          </Box>
        )}
        <div style={{ display: 'grid', gap: 20, opacity: groups.isPlaceholderData ? 0.6 : 1 }}>
          {items.map((g, i) => (
            <Group
              key={g.id}
              group={g}
              focused={keyboardMoved && i === focus}
              onFocus={() => setFocus(i)}
              onCompare={() => setComparing(i)}
              onApply={() => bulk.run([g])}
              onKeepAll={() => keepAll(g)}
              applying={bulk.isPending}
            />
          ))}
        </div>
        {total > 0 && (
          <Box float="right">
            <Pagination
              currentPageIndex={page}
              pagesCount={pages}
              onChange={(e) => { setPage(e.detail.currentPageIndex); window.scrollTo({ top: 0 }) }}
              ariaLabels={{ nextPageLabel: 'Next page', previousPageLabel: 'Previous page', pageLabel: (n) => `Page ${n}` }}
            />
          </Box>
        )}
      </SpaceBetween>

      <CompareModal
        key={comparing ?? 'none'}
        group={comparing !== null ? items[comparing] ?? null : null}
        onDismiss={() => setComparing(null)}
        onNextGroup={comparing !== null && comparing < items.length - 1 ? () => { setComparing(comparing + 1); setFocus(comparing + 1) } : undefined}
        onPreviousGroup={comparing !== null && comparing > 0 ? () => { setComparing(comparing - 1); setFocus(comparing - 1) } : undefined}
      />

      <Modal
        visible={confirmAll}
        onDismiss={() => setConfirmAll(false)}
        header={`Apply suggestions to all ${total.toLocaleString()} groups?`}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setConfirmAll(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => { setConfirmAll(false); bulk.run('all', total) }}>Apply to all groups</Button>
            </SpaceBetween>
          </Box>
        }
      >
        In every group the largest copy is kept and the others are marked for Trash, replacing choices you made
        before. Similar isn&apos;t always the same, so only do this if you have looked through the groups. Nothing changes
        in Drive until you use Cleanup.
      </Modal>

      <Modal
        visible={shortcutsOpen}
        onDismiss={() => setShortcutsOpen(false)}
        header="Keyboard shortcuts"
        footer={<Box float="right"><SpaceBetween direction="horizontal" size="xs"><Button variant="link" onClick={() => { setShortcutsOpen(false); openHelp() }}>Open help</Button><Button variant="primary" onClick={() => setShortcutsOpen(false)}>Close</Button></SpaceBetween></Box>}
      >
        <KeyValuePairs
          columns={2}
          items={[
            { label: 'J / K', value: 'Next / previous group' },
            { label: '1 / 2', value: 'Keep / trash the focused photo' },
            { label: 'A', value: 'Keep only the suggested copy in this group' },
            { label: 'C', value: 'Compare this group side by side' },
            { label: 'Tab', value: 'Move between photos' },
            { label: '?', value: 'Show these shortcuts' },
          ]}
        />
      </Modal>
    </ContentLayout>
  )
}
