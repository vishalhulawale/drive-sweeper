import Alert from '@cloudscape-design/components/alert'
import Box from '@cloudscape-design/components/box'
import Button from '@cloudscape-design/components/button'
import Container from '@cloudscape-design/components/container'
import Header from '@cloudscape-design/components/header'
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs'
import ProgressBar from '@cloudscape-design/components/progress-bar'
import SpaceBetween from '@cloudscape-design/components/space-between'
import { useCancelScan, useResumeScan, useScans, useStartScan } from '../../hooks/useScan'
import { errorMessage } from '../../services/api'
import { isActive, isResumable } from '../../types/scan'
import { formatDate, formatDuration } from '../../utils/format'
import { TextSkeleton } from '../loading/PageSkeleton'
import EmptyState from '../common/EmptyState'
import { ScanStatusIndicator } from '../common/status'

export default function ScanContainer() {
  const scans = useScans()
  const start = useStartScan()
  const resume = useResumeScan()
  const cancel = useCancelScan()
  const latest = scans.data?.[0]
  const active = latest ? isActive(latest) : false
  const mutationError = start.error ?? resume.error ?? cancel.error

  const actions = !scans.data ? undefined : active ? (
    <Button onClick={() => latest && cancel.mutate(latest.id)} loading={cancel.isPending}>Cancel scan</Button>
  ) : latest && isResumable(latest) ? (
    <Button onClick={() => resume.mutate(latest.id)} loading={resume.isPending}>Resume scan</Button>
  ) : !latest ? (
    <Button variant="primary" onClick={() => start.mutate()} loading={start.isPending}>Start first scan</Button>
  ) : undefined

  return (
    <Container header={<Header variant="h2" actions={actions} description="Reads file details only; nothing is downloaded or changed.">Drive scan</Header>}>
      <SpaceBetween size="m">
        {scans.isError && <Alert type="error">{errorMessage(scans.error)}</Alert>}
        {mutationError && <Alert type="error">{errorMessage(mutationError)}</Alert>}
        {scans.isPending && <TextSkeleton lines={2} />}
        {scans.data && !latest && (
          <EmptyState title="No scans yet">Scan your Drive to find duplicates and similar photos.</EmptyState>
        )}
        {latest && active && (
          <ProgressBar
            label="Scanning your Drive"
            value={latest.total_files ? (latest.processed_files / latest.total_files) * 100 : undefined}
            description={`${latest.processed_files.toLocaleString()} files read so far`}
            additionalInfo={`Started ${formatDate(latest.started_at)}`}
          />
        )}
        {latest && !active && (
          <KeyValuePairs
            columns={3}
            items={[
              { label: 'Status', value: <ScanStatusIndicator status={latest.status} /> },
              { label: 'Files read', value: latest.processed_files.toLocaleString() },
              { label: 'Started', value: <>{formatDate(latest.started_at)} <Box variant="span" color="text-body-secondary">({formatDuration(latest.started_at, latest.completed_at)})</Box></> },
            ]}
          />
        )}
        {latest?.error_message && (
          <Alert type={latest.status === 'failed' ? 'error' : 'warning'}>{latest.error_message}</Alert>
        )}
      </SpaceBetween>
    </Container>
  )
}
