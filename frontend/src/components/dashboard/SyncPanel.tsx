import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useRunSync, useSyncStatus } from '../../hooks/useSync'
import { errorMessage } from '../../services/api'
import { formatDate } from '../../utils/format'

/** Quick sync: pulls only what changed in Drive since the last scan or sync. */
export default function SyncPanel({ scanning }: { scanning: boolean }) {
  const status = useSyncStatus()
  const sync = useRunSync()
  const available = status.data?.available ?? false
  const r = sync.data

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Stack sx={{ flexGrow: 1 }}>
            <Typography variant="h6">Quick sync</Typography>
            <Typography variant="body2" color="text.secondary">
              {available
                ? `Last synced ${formatDate(status.data?.last_sync_at)}. Picks up only what changed in Drive, usually in seconds.`
                : 'Not available yet. Run one full scan first; it sets the starting point.'}
            </Typography>
          </Stack>
          <Button variant="outlined" disabled={!available || scanning || sync.isPending} onClick={() => sync.mutate()}>
            {sync.isPending ? 'Syncing…' : 'Sync now'}
          </Button>
        </Stack>
        {r && (
          <Alert severity="success" sx={{ mt: 2 }}>
            {r.updated === 0 && r.removed === 0
              ? 'Already up to date.'
              : `${r.updated.toLocaleString()} updated, ${r.removed.toLocaleString()} removed.`}
          </Alert>
        )}
        {sync.isError && <Alert severity="warning" sx={{ mt: 2 }}>{errorMessage(sync.error)}</Alert>}
      </CardContent>
    </Card>
  )
}
