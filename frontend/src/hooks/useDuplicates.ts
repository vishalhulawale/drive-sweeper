import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { duplicateService } from '../services/duplicateService'
import type { DuplicateAction, DuplicateSort } from '../types/duplicate'

export function useDuplicateSummary() {
  return useQuery({ queryKey: ['dup-summary'], queryFn: duplicateService.summary })
}

export function useDuplicateGroups(sort: DuplicateSort, page: number, pageSize = 20) {
  return useQuery({
    queryKey: ['dup-groups', sort, page, pageSize],
    queryFn: () => duplicateService.list(sort, page, pageSize),
    placeholderData: keepPreviousData,
  })
}

export function useDetectDuplicates() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: duplicateService.detect,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['dup-summary'] })
      qc.invalidateQueries({ queryKey: ['dup-groups'] })
    },
  })
}

export function useSelectAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { entryId: number; action: DuplicateAction | null }) =>
      duplicateService.select(v.entryId, v.action),
    onSettled: () => qc.invalidateQueries({ queryKey: ['dup-groups'] }),
  })
}
