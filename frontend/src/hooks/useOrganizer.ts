import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { organizerService } from '../services/organizerService'

export const useSuggestions = (source: string) =>
  useQuery({ queryKey: ['org-suggestions', source], queryFn: () => organizerService.suggestions(source) })
export const useOrganizerHistory = () =>
  useQuery({ queryKey: ['org-history'], queryFn: organizerService.history })

function useInvalidating<A, R>(fn: (arg: A) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      for (const key of ['org-suggestions', 'org-history', 'files', 'summary', 'cleanup-ops']) {
        qc.invalidateQueries({ queryKey: [key] })
      }
    },
  })
}

export const useApplyMoves = () => useInvalidating(organizerService.apply)
export const useUndoMove = () => useInvalidating(organizerService.undo)
