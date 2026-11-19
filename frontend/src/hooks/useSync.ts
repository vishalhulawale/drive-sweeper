import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
