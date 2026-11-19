import { Button } from '../components/ui/core'
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useArchiveStatus, useCancelArchives } from '../hooks/useArchives'
import { useCancelCleanup, useCleanupStatus } from '../hooks/useCleanup'
import { useNearStatus } from '../hooks/useNear'
import { useScans } from '../hooks/useScan'
import { isActive } from '../types/scan'
import type { NotificationsApi } from './notifications'

/** Long-running jobs (full scan, photo analysis, cleanup) report progress in the notification bar on every page. */
export function useJobNotifications({ notify, dismiss }: NotificationsApi) {
  const navigate = useNavigate()
  const scans = useScans()
  const near = useNearStatus()
  const cleanup = useCleanupStatus()
  const { mutate: cancelCleanup } = useCancelCleanup()
  const archives = useArchiveStatus()
  const { mutate: cancelArchives } = useCancelArchives()
  const was = useRef({ scan: false, near: false, cleanup: false, archives: false })

  const scan = scans.data?.[0]
  const scanActive = scan ? isActive(scan) : false
  useEffect(() => {
    if (scan && scanActive) {
      notify({
        id: 'job-scan', type: 'in-progress', loading: true, header: 'Scanning your Drive',
        content: `${scan.processed_files.toLocaleString()} files read so far. You can keep using DriveClean.`,
      })
    } else if (was.current.scan && scan) {
      notify({
        id: 'job-scan', type: scan.status === 'completed' ? 'success' : 'warning', autoDismissMs: 10000,
        content: scan.status === 'completed'
          ? `Scan finished: ${scan.processed_files.toLocaleString()} files read.`
          : `Scan ${scan.status}. ${scan.error_message ?? ''}`,
      })
    }
    was.current.scan = scanActive
  }, [scan, scanActive, notify])

  const n = near.data
  useEffect(() => {
    if (n?.running) {
      const done = n.eligible - n.pending
      notify({
        id: 'job-near', type: 'in-progress', loading: true, header: 'Analysing photos',
        content: `${done.toLocaleString()} of ${n.eligible.toLocaleString()} photos analysed.`,
        action: <Button onClick={() => navigate('/similar')}>View similar photos</Button>,
      })
    } else if (was.current.near && n) {
      notify({
        id: 'job-near', type: n.last_error ? 'warning' : 'success', autoDismissMs: 10000,
        content: n.last_error
          ? `Photo analysis stopped: ${n.last_error}`
          : `Photo analysis finished: ${n.groups.toLocaleString()} groups of similar photos.`,
      })
    }
    was.current.near = n?.running ?? false
  }, [n, notify, navigate])

  const c = cleanup.data
  useEffect(() => {
    if (c?.running) {
      const done = c.total - c.remaining
      notify({
        id: 'job-cleanup', type: 'in-progress', loading: true, header: 'Moving files to Trash',
        content: `${done.toLocaleString()} of ${c.total.toLocaleString()} done. It keeps running while the server is up.`,
        action: <Button onClick={() => cancelCleanup()}>Cancel remaining</Button>,
      })
    } else if (was.current.cleanup && c) {
      notify({
        id: 'job-cleanup', type: 'success', autoDismissMs: 15000,
        content: `Finished moving ${c.total.toLocaleString()} files to Trash.`,
        action: <Button onClick={() => navigate('/cleanup')}>View history</Button>,
      })
    }
    was.current.cleanup = c?.running ?? false
  }, [c, notify, navigate, cancelCleanup])

  const a = archives.data
  useEffect(() => {
    if (!a) return
    const finished = a.extractions.filter((e) => !['pending', 'running'].includes(e.status))
    if (a.running) {
      notify({
        id: 'job-archives', type: 'in-progress', loading: true, header: 'Extracting archives',
        content: `${finished.length} of ${a.extractions.length} archives finished. It keeps running while the server is up.`,
        action: <Button onClick={() => cancelArchives()}>Cancel remaining</Button>,
      })
    } else if (was.current.archives) {
      const ok = finished.filter((e) => e.status === 'completed').length
      const bad = finished.length - ok
      notify({
        id: 'job-archives', type: bad ? 'warning' : 'success', autoDismissMs: 15000,
        content: bad
          ? `Extracted ${ok} archive${ok === 1 ? '' : 's'}; ${bad} did not finish and were kept.`
          : `Extracted ${ok} archive${ok === 1 ? '' : 's'} and moved ${ok === 1 ? 'it' : 'them'} to Trash.`,
        action: <Button onClick={() => navigate('/archives')}>View details</Button>,
      })
    }
    was.current.archives = a.running
  }, [a, notify, navigate, cancelArchives])

  useEffect(() => () => ['job-scan', 'job-near', 'job-cleanup', 'job-archives'].forEach(dismiss), [dismiss])
}
