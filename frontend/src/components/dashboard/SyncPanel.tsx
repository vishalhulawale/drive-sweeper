import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useRunSync, useSyncSettings, useSyncStatus } from '../../hooks/useSync'
import { errorMessage } from '../../services/api'
import { formatDate } from '../../utils/format'

/** Quick sync: pulls only what changed in Drive since the last scan or sync. */
export default function SyncPanel({ scanning }: { scanning: boolean }) {
  const status = useSyncStatus()
  const sync = useRunSync()
  const settings = useSyncSettings()
  const auto = status.data?.auto_sync_enabled ?? true
  const minutes = status.data?.auto_sync_minutes ?? 15
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
        {available && (
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mt: 2, flexWrap: 'wrap' }}>
            <FormControlLabel
              control={
                <Switch checked={auto} disabled={settings.isPending}
                  onChange={(e) => settings.mutate({ enabled: e.target.checked, minutes })} />
              }
              label="Sync automatically while the app is running"
            />
            <TextField select size="small" label="Every" value={minutes} disabled={!auto || settings.isPending}
              onChange={(e) => settings.mutate({ enabled: auto, minutes: Number(e.target.value) })} sx={{ minWidth: 130 }}>
              {[5, 15, 30, 60, 180, 720].map((m) => (
                <MenuItem key={m} value={m}>{m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? '' : 's'}`}</MenuItem>
              ))}
            </TextField>
          </Stack>
        )}
        {status.data?.last_error && (
          <Alert severity="warning" sx={{ mt: 2 }}>Last automatic sync failed: {status.data.last_error}</Alert>
        )}
        {settings.isError && <Alert severity="error" sx={{ mt: 2 }}>{errorMessage(settings.error)}</Alert>}
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
