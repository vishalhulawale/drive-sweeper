import { useState } from 'react'
import InfoLink from '../components/common/InfoLink'
import { TextSkeleton } from '../components/loading/PageSkeleton'
import { Alert, Button, Checkbox, KeyValues, PageHeader, Panel, RadioCards, Select, Status } from '../components/ui/core'
import { Modal } from '../components/ui/overlay'
import { useAuthStatus, useDisconnect } from '../hooks/useGoogleDrive'
import { useSyncSettings, useSyncStatus } from '../hooks/useSync'
import { useNotify } from '../layouts/notifications'
import { errorMessage } from '../services/api'
import { authService } from '../services/authService'
import { setPreferences, usePreferences, type DensityPref, type ThemePref } from '../theme/preferences'
import { formatDate, intervalLabel } from '../utils/format'

const INTERVALS = [5, 15, 30, 60, 180, 720].map((m) => ({ value: String(m), label: intervalLabel(m) }))

function Connection() {
  const auth = useAuthStatus()
  const disconnect = useDisconnect()
  const [confirming, setConfirming] = useState(false)
  const a = auth.data

  return (
    <Panel
      title="Google Drive connection"
      actions={
        <>
          {a && !a.can_trash && <Button href={authService.upgradeUrl}>Allow moving to Trash</Button>}
          <Button onClick={() => setConfirming(true)}>Disconnect</Button>
        </>
      }
    >
      <KeyValues
        columns={2}
        items={[
          { label: 'Connected account', value: <span className="font-semibold">{a?.email ?? '—'}</span> },
          {
            label: 'Permissions',
            value: (
              <div className="flex flex-col gap-1">
                <Status type="success">Read file details</Status>
                {a?.can_trash
                  ? <Status type="success">Move files to Trash and between folders</Status>
                  : <Status type="stopped">Move files to Trash: not granted</Status>}
              </div>
            ),
          },
        ]}
      />
      <Modal
        visible={confirming}
        onDismiss={() => setConfirming(false)}
        header="Disconnect Google Drive?"
        footer={
          <>
            <Button variant="link" onClick={() => setConfirming(false)} className="mr-2">Keep connected</Button>
            <Button variant="primary" loading={disconnect.isPending} onClick={() => disconnect.mutate()}>Disconnect</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p>
            DriveClean&apos;s access is revoked at Google, and the stored sign-in tokens and file inventory are deleted
            from this computer. Your files in Drive are not touched.
          </p>
          {disconnect.isError && <Alert type="error">{errorMessage(disconnect.error)}</Alert>}
        </div>
      </Modal>
    </Panel>
  )
}

function Display() {
  const prefs = usePreferences()
  return (
    <Panel title="Display" description="Saved in this browser.">
      <div className="flex flex-col gap-5">
        <RadioCards<ThemePref>
          label="Theme"
          value={prefs.theme}
          onChange={(theme) => setPreferences({ theme })}
          options={[
            { value: 'light', label: 'Light', description: 'The default' },
            { value: 'dark', label: 'Dark' },
            { value: 'system', label: 'Match system', description: "Follows your computer's setting" },
          ]}
        />
        <RadioCards<DensityPref>
          label="Table density"
          value={prefs.density}
          onChange={(density) => setPreferences({ density })}
          options={[
            { value: 'comfortable', label: 'Comfortable', description: 'The default' },
            { value: 'compact', label: 'Compact', description: 'More rows on screen' },
          ]}
        />
      </div>
    </Panel>
  )
}

function Sync() {
  const status = useSyncStatus()
  const save = useSyncSettings()
  const { notify } = useNotify()
  const s = status.data

  const update = (v: { enabled: boolean; minutes: number }) =>
    save.mutate(v, {
      onSuccess: (r) => notify({
        id: 'sync-settings', type: 'success', autoDismissMs: 5000,
        content: r.auto_sync_enabled ? `Automatic sync is on, every ${intervalLabel(r.auto_sync_minutes)}.` : 'Automatic sync is off.',
      }),
      onError: (e) => notify({ id: 'sync-settings', type: 'error', header: "Couldn't save sync settings", content: errorMessage(e) }),
    })

  return (
    <Panel title="Quick sync" description="Quick sync picks up only what changed in Drive since the last scan or sync.">
      {!s ? (
        <TextSkeleton lines={2} />
      ) : !s.available ? (
        <Status type="info">Available after your first full scan.</Status>
      ) : (
        <div className="flex flex-col gap-5">
          <Checkbox
            checked={s.auto_sync_enabled}
            disabled={save.isPending}
            onChange={(enabled) => update({ enabled, minutes: s.auto_sync_minutes })}
            description={`Last synced ${formatDate(s.last_sync_at)}`}
          >
            Sync automatically while the app is running
          </Checkbox>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">How often</span>
            <Select
              className="mt-1 block w-56"
              disabled={!s.auto_sync_enabled || save.isPending}
              value={INTERVALS.find((o) => o.value === String(s.auto_sync_minutes))?.value ?? null}
              options={INTERVALS}
              onChange={(v) => update({ enabled: true, minutes: Number(v) })}
            />
          </label>
          {s.last_error && <Alert type="warning">Last automatic sync failed: {s.last_error}</Alert>}
        </div>
      )}
    </Panel>
  )
}

export default function Settings() {
  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" info={<InfoLink />} />
      <div className="flex flex-col gap-6">
        <Connection />
        <Display />
        <Sync />
      </div>
    </div>
  )
}
