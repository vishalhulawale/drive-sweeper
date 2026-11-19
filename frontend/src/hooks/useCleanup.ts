import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cleanupService } from '../services/cleanupService'

export const useCleanupPlan = () => useQuery({ queryKey: ['cleanup-plan'], queryFn: cleanupService.plan })
export const useOperations = () => useQuery({ queryKey: ['cleanup-ops'], queryFn: cleanupService.operations })

function useInvalidating<A>(fn: (arg: A) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      for (const key of ['cleanup-plan', 'cleanup-ops', 'dup-groups', 'dup-summary', 'files', 'summary']) {
        qc.invalidateQueries({ queryKey: [key] })
      }
    },
  })
}

export const useExecuteCleanup = () => useInvalidating<number>(cleanupService.execute)
export const useRestore = () => useInvalidating<number>(cleanupService.restore)
