import Alert from '@cloudscape-design/components/alert'
import Button from '@cloudscape-design/components/button'
import Container from '@cloudscape-design/components/container'
import Header from '@cloudscape-design/components/header'
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs'
import SpaceBetween from '@cloudscape-design/components/space-between'
import StatusIndicator from '@cloudscape-design/components/status-indicator'
import { useRunSync, useSyncStatus } from '../../hooks/useSync'
import { useNotify } from '../../layouts/notifications'
import { errorMessage } from '../../services/api'
import { formatDate, intervalLabel } from '../../utils/format'
import { AppLink } from '../common/RouterLink'
import { TextSkeleton } from '../loading/PageSkeleton'


/** Quick sync status and "Sync now"; its settings live on the Settings page. */
export default function SyncSummary({ scanning }: { scanning: boolean }) {
  const status = useSyncStatus()
  const sync = useRunSync()
  const { notify } = useNotify()
  const s = status.data

  const run = () =>
    sync.mutate(undefined, {
      onSuccess: (r) =>
        notify({
          id: 'sync-result', type: 'success', autoDismissMs: 8000,
          content: r.updated === 0 && r.removed === 0
            ? 'Quick sync: already up to date.'
            : `Quick sync: ${r.updated.toLocaleString()} updated, ${r.removed.toLocaleString()} removed.`,
        }),
      onError: (e) => notify({ id: 'sync-result', type: 'error', header: 'Quick sync failed', content: errorMessage(e) }),
    })

  return (
    <Container
      header={
        <Header
          variant="h2"
          description="Picks up only what changed in Drive, usually in seconds."
          actions={<Button onClick={run} loading={sync.isPending} disabled={!s?.available || scanning}>Sync now</Button>}
        >
          Quick sync
        </Header>
      }
    >
      {!s ? (
        <TextSkeleton lines={2} />
      ) : !s.available ? (
        <StatusIndicator type="info">Available after your first full scan.</StatusIndicator>
      ) : (
        <SpaceBetween size="m">
          <KeyValuePairs
            columns={2}
            items={[
              { label: 'Last synced', value: formatDate(s.last_sync_at) },
              {
                label: 'Automatic sync',
                value: s.auto_sync_enabled
                  ? <StatusIndicator type="success">Every {intervalLabel(s.auto_sync_minutes)}</StatusIndicator>
                  : <StatusIndicator type="stopped">Off</StatusIndicator>,
                info: <AppLink href="/settings" variant="info">Change</AppLink>,
              },
            ]}
          />
          {s.last_error && <Alert type="warning">Last automatic sync failed: {s.last_error}</Alert>}
        </SpaceBetween>
      )}
    </Container>
  )
}
