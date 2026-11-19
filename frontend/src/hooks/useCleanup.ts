import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cleanupService } from '../services/cleanupService'

export const useCleanupPlan = () => useQuery({ queryKey: ['cleanup-plan'], queryFn: cleanupService.plan })
export const useCleanupStatus = () =>
  useQuery({
    queryKey: ['cleanup-status'],
    queryFn: cleanupService.status,
    // Poll while a background run is active.
    refetchInterval: (q) => (q.state.data?.running ? 2000 : false),
  })
export const useOperations = (running: boolean) =>
  useQuery({
    queryKey: ['cleanup-ops'],
    queryFn: cleanupService.operations,
    refetchInterval: running ? 3000 : false,
  })

function useInvalidating<A>(fn: (arg: A) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      for (const key of ['cleanup-plan', 'cleanup-ops', 'cleanup-status', 'dup-groups', 'dup-summary', 'files', 'summary']) {
        qc.invalidateQueries({ queryKey: [key] })
      }
    },
  })
}

export const useExecuteCleanup = () => useInvalidating<number>(cleanupService.execute)
export const useCancelCleanup = () => useInvalidating<void>(() => cleanupService.cancel())
export const useRestore = () => useInvalidating<number>(cleanupService.restore)
