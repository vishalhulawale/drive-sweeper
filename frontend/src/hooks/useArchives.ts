import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { archiveService } from '../services/archiveService'

export const useArchives = (ownedOnly: boolean) =>
  useQuery({ queryKey: ['archives', ownedOnly], queryFn: () => archiveService.list(ownedOnly) })
export const useArchiveHistory = () => useQuery({ queryKey: ['archive-history'], queryFn: archiveService.history })

/** Progress of the current (or last) run; polls while it is active, and refreshes everything once it ends. */
export function useArchiveStatus() {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['archive-status'],
    queryFn: archiveService.status,
    refetchInterval: (s) => (s.state.data?.running ? 2000 : false),
  })
  const running = q.data?.running ?? false
  const was = useRef(false)
  useEffect(() => {
    if (was.current && !running) {
      // Archives went to Trash and new files arrived: anything derived from the inventory changed.
      for (const key of ['archives', 'archive-history', 'cleanup-ops', 'files', 'summary', 'dup-summary', 'dup-groups', 'trash-overview']) {
        qc.invalidateQueries({ queryKey: [key] })
      }
    }
    was.current = running
  }, [running, qc])
  return q
}

function useArchiveMutation<A>(fn: (arg: A) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      for (const key of ['archive-status', 'archives', 'archive-history']) qc.invalidateQueries({ queryKey: [key] })
    },
  })
}

export const useExtractArchives = () => useArchiveMutation<number[]>(archiveService.extract)
export const useCancelArchives = () => useArchiveMutation<void>(() => archiveService.cancel())
