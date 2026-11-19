import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { organizerService } from '../services/organizerService'
import type { SuggestMethod } from '../types/organizer'

export const useSuggestions = (source: string, method: SuggestMethod) =>
  useQuery({ queryKey: ['org-suggestions', source, method], queryFn: () => organizerService.suggestions(source, method) })
export const useOrganizerHistory = () =>
  useQuery({ queryKey: ['org-history'], queryFn: organizerService.history })

export function useContentStatus(source: string, enabled: boolean) {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['org-content-status', source],
    queryFn: () => organizerService.contentStatus(source),
    enabled,
    // Poll while the background analysis runs.
    refetchInterval: (query) => (query.state.data?.running ? 2000 : false),
  })
  // Refresh the suggestions as files are classified, and once more when the run ends.
  const done = q.data?.progress_done
  const running = q.data?.running
  const last = useRef<string>('')
  useEffect(() => {
    const key = `${running}-${done}`
    if (last.current && last.current !== key) qc.invalidateQueries({ queryKey: ['org-suggestions'] })
    last.current = key
  }, [running, done, qc])
  return q
}

function useInvalidating<A, R>(fn: (arg: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      for (const key of ['org-suggestions', 'org-history', 'org-content-status', 'files', 'summary', 'cleanup-ops']) {
        qc.invalidateQueries({ queryKey: [key] })
      }
    },
  })
}

export const useApplyMoves = () => useInvalidating(organizerService.apply)
export const useUndoMove = () => useInvalidating(organizerService.undo)
export const useStartContent = () => useInvalidating(organizerService.startContent)
export const useCancelContent = () => useInvalidating(organizerService.cancelContent)
