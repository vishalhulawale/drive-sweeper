import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { scanService } from '../services/scanService'
import { isActive } from '../types/scan'

export function useScans() {
  return useQuery({
    queryKey: ['scans'],
    queryFn: scanService.list,
    // Poll while any scan is running so progress updates live.
    refetchInterval: (query) => (query.state.data?.some(isActive) ? 2000 : false),
  })
}

function useScanMutation<A>(fn: (arg: A) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['scans'] })
      qc.invalidateQueries({ queryKey: ['files'] })
      qc.invalidateQueries({ queryKey: ['summary'] })
    },
  })
}

export const useStartScan = () => useScanMutation<void>(() => scanService.start())
export const useResumeScan = () => useScanMutation<number>(scanService.resume)
export const useCancelScan = () => useScanMutation<number>(scanService.cancel)
