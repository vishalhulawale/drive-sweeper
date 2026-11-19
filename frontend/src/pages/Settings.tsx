import Alert from '@cloudscape-design/components/alert'
import Box from '@cloudscape-design/components/box'
import Button from '@cloudscape-design/components/button'
import Container from '@cloudscape-design/components/container'
import ContentLayout from '@cloudscape-design/components/content-layout'
import FormField from '@cloudscape-design/components/form-field'
import Header from '@cloudscape-design/components/header'
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs'
import Modal from '@cloudscape-design/components/modal'
import Select from '@cloudscape-design/components/select'
import SpaceBetween from '@cloudscape-design/components/space-between'
import StatusIndicator from '@cloudscape-design/components/status-indicator'
import Tiles from '@cloudscape-design/components/tiles'
import Toggle from '@cloudscape-design/components/toggle'
import { useState } from 'react'
import InfoLink from '../components/common/InfoLink'
import { TextSkeleton } from '../components/loading/PageSkeleton'
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
    <Container
      header={
        <Header
          variant="h2"
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              {a && !a.can_trash && <Button href={authService.upgradeUrl}>Allow moving to Trash</Button>}
              <Button onClick={() => setConfirming(true)}>Disconnect</Button>
            </SpaceBetween>
          }
        >
          Google Drive connection
        </Header>
      }
    >
      <KeyValuePairs
        columns={2}
        items={[
          { label: 'Connected account', value: a?.email ?? '—' },
          {
            label: 'Permissions',
            value: (
              <SpaceBetween size="xxs">
                <StatusIndicator type="success">Read file details</StatusIndicator>
                {a?.can_trash
                  ? <StatusIndicator type="success">Move files to Trash and between folders</StatusIndicator>
                  : <StatusIndicator type="stopped">Move files to Trash: not granted</StatusIndicator>}
              </SpaceBetween>
            ),
          },
        ]}
      />
      <Modal
        visible={confirming}
        onDismiss={() => setConfirming(false)}
        header="Disconnect Google Drive?"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setConfirming(false)}>Keep connected</Button>
              <Button variant="primary" loading={disconnect.isPending} onClick={() => disconnect.mutate()}>Disconnect</Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="s">
          <Box variant="p">
            DriveClean&apos;s access is revoked at Google, and the stored sign-in tokens and file inventory are deleted
            from this computer. Your files in Drive are not touched.
          </Box>
          {disconnect.isError && <Alert type="error">{errorMessage(disconnect.error)}</Alert>}
        </SpaceBetween>
      </Modal>
    </Container>
  )
}

function Display() {
  const prefs = usePreferences()
  return (
    <Container header={<Header variant="h2" description="Saved in this browser.">Display</Header>}>
      <SpaceBetween size="l">
        <FormField label="Theme">
          <Tiles
            value={prefs.theme}
            onChange={(e) => setPreferences({ theme: e.detail.value as ThemePref })}
            columns={3}
            items={[
              { value: 'light', label: 'Light', description: 'The default' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'Match system', description: "Follows your computer's setting" },
            ]}
          />
        </FormField>
        <FormField label="Density">
          <Tiles
            value={prefs.density}
            onChange={(e) => setPreferences({ density: e.detail.value as DensityPref })}
            columns={3}
            items={[
              { value: 'comfortable', label: 'Comfortable', description: 'The default' },
              { value: 'compact', label: 'Compact', description: 'More rows on screen' },
            ]}
          />
        </FormField>
      </SpaceBetween>
    </Container>
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
    <Container header={<Header variant="h2" description="Quick sync picks up only what changed in Drive since the last scan or sync.">Quick sync</Header>}>
      {!s ? (
        <TextSkeleton lines={2} />
      ) : !s.available ? (
        <StatusIndicator type="info">Available after your first full scan.</StatusIndicator>
      ) : (
        <SpaceBetween size="l">
          <Toggle
            checked={s.auto_sync_enabled}
            disabled={save.isPending}
            onChange={(e) => update({ enabled: e.detail.checked, minutes: s.auto_sync_minutes })}
            description={`Last synced ${formatDate(s.last_sync_at)}`}
          >
            Sync automatically while the app is running
          </Toggle>
          <FormField label="How often">
            <div style={{ maxWidth: 220 }}>
              <Select
                disabled={!s.auto_sync_enabled || save.isPending}
                selectedOption={INTERVALS.find((o) => o.value === String(s.auto_sync_minutes)) ?? null}
                options={INTERVALS}
                onChange={(e) => update({ enabled: true, minutes: Number(e.detail.selectedOption.value) })}
              />
            </div>
          </FormField>
          {s.last_error && <Alert type="warning">Last automatic sync failed: {s.last_error}</Alert>}
        </SpaceBetween>
      )}
    </Container>
  )
}

export default function Settings() {
  return (
    <ContentLayout header={<Header variant="h1" info={<InfoLink />}>Settings</Header>}>
      <SpaceBetween size="l">
        <Connection />
        <Display />
        <Sync />
      </SpaceBetween>
    </ContentLayout>
  )
}
