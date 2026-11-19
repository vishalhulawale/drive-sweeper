import { useRunSync, useSyncStatus } from '../../hooks/useSync'
import { useNotify } from '../../layouts/notifications'
import { errorMessage } from '../../services/api'
import { formatDate, intervalLabel } from '../../utils/format'
import { TextSkeleton } from '../loading/PageSkeleton'
import { Alert, AppLink, Button, KeyValues, Panel, Status } from '../ui/core'

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
    <Panel
      title="Quick sync"
      description="Picks up only what changed in Drive, usually in seconds."
      actions={<Button onClick={run} loading={sync.isPending} disabled={!s?.available || scanning}>Sync now</Button>}
    >
      {!s ? (
        <TextSkeleton lines={2} />
      ) : !s.available ? (
        <Status type="info">Available after your first full scan.</Status>
      ) : (
        <div className="flex flex-col gap-4">
          <KeyValues
            columns={2}
            items={[
              { label: 'Last synced', value: formatDate(s.last_sync_at) },
              {
                label: 'Automatic sync',
                info: <AppLink to="/settings">Change</AppLink>,
                value: s.auto_sync_enabled
                  ? <Status type="success">Every {intervalLabel(s.auto_sync_minutes)}</Status>
                  : <Status type="stopped">Off</Status>,
              },
            ]}
          />
          {s.last_error && <Alert type="warning">Last automatic sync failed: {s.last_error}</Alert>}
        </div>
      )}
    </Panel>
  )
}
