import { useCancelScan, useResumeScan, useScans, useStartScan } from '../../hooks/useScan'
import { errorMessage } from '../../services/api'
import { isActive, isResumable } from '../../types/scan'
import { formatDate, formatDuration } from '../../utils/format'
import EmptyState from '../common/EmptyState'
import { ScanStatusIndicator } from '../common/status'
import { TextSkeleton } from '../loading/PageSkeleton'
import { Alert, Button, KeyValues, Panel, ProgressBar, Secondary } from '../ui/core'

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
    <Panel title="Drive scan" actions={actions} description="Reads file details only; nothing is downloaded or changed.">
      <div className="flex flex-col gap-4">
        {scans.isError && <Alert type="error">{errorMessage(scans.error)}</Alert>}
        {mutationError && <Alert type="error">{errorMessage(mutationError)}</Alert>}
        {scans.isPending && <TextSkeleton lines={2} />}
        {scans.data && !latest && <EmptyState title="No scans yet">Scan your Drive to find duplicates and similar photos.</EmptyState>}
        {latest && active && (
          <ProgressBar
            label="Scanning your Drive"
            value={latest.total_files ? (latest.processed_files / latest.total_files) * 100 : undefined}
            description={`${latest.processed_files.toLocaleString()} files read so far`}
            info={`Started ${formatDate(latest.started_at)}`}
          />
        )}
        {latest && !active && (
          <KeyValues
            columns={3}
            items={[
              { label: 'Status', value: <ScanStatusIndicator status={latest.status} /> },
              { label: 'Files read', value: <span data-numeric>{latest.processed_files.toLocaleString()}</span> },
              { label: 'Started', value: <>{formatDate(latest.started_at)} <Secondary>({formatDuration(latest.started_at, latest.completed_at)})</Secondary></> },
            ]}
          />
        )}
        {latest?.error_message && <Alert type={latest.status === 'failed' ? 'error' : 'warning'}>{latest.error_message}</Alert>}
      </div>
    </Panel>
  )
}
