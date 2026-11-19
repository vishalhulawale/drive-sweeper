import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { nearService } from '../services/nearService'

export const useNearStatus = () =>
  useQuery({
    queryKey: ['near-status'],
    queryFn: nearService.status,
    // Poll while the background analysis runs.
    refetchInterval: (q) => (q.state.data?.running ? 2000 : false),
  })

function useNearMutation(fn: () => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['near-status'] })
      qc.invalidateQueries({ queryKey: ['dup-groups'] })
      qc.invalidateQueries({ queryKey: ['cleanup-plan'] })
    },
  })
}

export const useStartNear = () => useNearMutation(nearService.start)
export const useCancelNear = () => useNearMutation(nearService.cancel)
export const useRegroupNear = () => useNearMutation(nearService.detect)
