import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useNotify } from '../layouts/notifications'
import { syncService } from '../services/syncService'

export const useSyncStatus = () => useQuery({ queryKey: ['sync-status'], queryFn: syncService.status })

export function useSyncSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { enabled: boolean; minutes: number }) => syncService.saveSettings(v.enabled, v.minutes),
    onSuccess: (data) => qc.setQueryData(['sync-status'], data),
  })
}

export function useRunSync() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: syncService.run,
    onSettled: () => {
      // Anything derived from the inventory may have changed.
      for (const key of ['sync-status', 'files', 'summary', 'dup-summary', 'dup-groups', 'an-overview',
        'an-year', 'an-files', 'an-folders', 'org-suggestions', 'cleanup-plan']) {
        qc.invalidateQueries({ queryKey: [key] })
      }
    },
  })
}

const AUTO_SYNC_GAP_MS = 60_000
let lastAutoSync = 0 // module-level: shared by every page, survives navigation and StrictMode double mounts

/** Pull changes made directly in Drive when a review page opens, so files deleted or changed there
 *  stop showing. Quiet unless something changed; skipped while `paused` (e.g. a cleanup run) and if a
 *  sync ran less than a minute ago. Returns true while it is running. */
export function useSyncOnOpen(paused = false) {
  const status = useSyncStatus()
  const sync = useRunSync()
  const { notify } = useNotify()
  const available = status.data?.available ?? false
  const { mutate } = sync

  useEffect(() => {
    if (!available || paused || Date.now() - lastAutoSync < AUTO_SYNC_GAP_MS) return
    lastAutoSync = Date.now()
    mutate(undefined, {
      onSuccess: (r) => {
        if (!r.updated && !r.removed) return
        notify({
          id: 'sync-result', type: 'info', autoDismissMs: 8000,
          content: `Updated from Drive: ${r.updated.toLocaleString()} changed, ${r.removed.toLocaleString()} removed.`,
        })
      },
      // A scan or another sync is running, or Drive is unreachable: the page still works with what it has.
      onError: () => {},
    })
  }, [available, paused, mutate, notify])

  return sync.isPending
}
