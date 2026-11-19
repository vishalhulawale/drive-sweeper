import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { trashService } from '../services/trashService'
import type { TrashSort } from '../types/trash'

export const useTrashOverview = () => useQuery({ queryKey: ['trash-overview'], queryFn: trashService.overview })
export const useTrashItems = (sort: TrashSort, page: number, pageSize = 50) =>
  useQuery({
    queryKey: ['trash-items', sort, page, pageSize],
    queryFn: () => trashService.items(sort, page, pageSize),
    placeholderData: keepPreviousData,
  })

export function useRefreshTrashDates() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: trashService.refreshDates,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['trash-overview'] })
      qc.invalidateQueries({ queryKey: ['trash-items'] })
    },
  })
}

/** The 200 items Drive deletes soonest, for the deletion timeline. */
export const useTrashTimeline = () =>
  useQuery({ queryKey: ['trash-items', 'timeline'], queryFn: () => trashService.items('deletes', 1, 200) })
