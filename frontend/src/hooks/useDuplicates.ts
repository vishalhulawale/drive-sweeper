import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { duplicateService } from '../services/duplicateService'
import type { DuplicateAction, DuplicatePage, DuplicateSort } from '../types/duplicate'

export function useDuplicateSummary() {
  return useQuery({ queryKey: ['dup-summary'], queryFn: duplicateService.summary })
}

export function useDuplicateGroups(sort: DuplicateSort, page: number, pageSize = 20, kind: 'exact' | 'near' = 'exact') {
  return useQuery({
    queryKey: ['dup-groups', kind, sort, page, pageSize],
    queryFn: () => duplicateService.list(sort, page, pageSize, kind),
    placeholderData: keepPreviousData,
  })
}

/** Prefetch a page of groups (e.g. the next one) so paging feels instant. */
export function usePrefetchGroups() {
  const qc = useQueryClient()
  return (sort: DuplicateSort, page: number, pageSize: number, kind: 'exact' | 'near') =>
    qc.prefetchQuery({
      queryKey: ['dup-groups', kind, sort, page, pageSize],
      queryFn: () => duplicateService.list(sort, page, pageSize, kind),
      staleTime: 30_000,
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

/** A file's previous choice, so a bulk change can be undone. */
export interface Selection {
  entryId: number
  action: DuplicateAction | null
}

type Snapshot = [readonly unknown[], DuplicatePage | undefined][]

/** Apply choices to every cached page of groups at once (optimistic update). Returns the old caches. */
async function patchCaches(qc: QueryClient, choose: (entryId: number, current: DuplicateAction | null, recommended: DuplicateAction | null) => DuplicateAction | null | undefined) {
  await qc.cancelQueries({ queryKey: ['dup-groups'] })
  const snapshot: Snapshot = qc.getQueriesData<DuplicatePage>({ queryKey: ['dup-groups'] })
  for (const [key, page] of snapshot) {
    if (!page) continue
    qc.setQueryData<DuplicatePage>(key, {
      ...page,
      items: page.items.map((g) => ({
        ...g,
        files: g.files.map((e) => {
          const next = choose(e.entry_id, e.user_selected_action, e.recommended_action)
          return next === undefined ? e : { ...e, user_selected_action: next }
        }),
      })),
    })
  }
  return snapshot
}

function restore(qc: QueryClient, snapshot: Snapshot | undefined) {
  snapshot?.forEach(([key, page]) => qc.setQueryData(key, page))
}

function refresh(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['dup-groups'] })
  qc.invalidateQueries({ queryKey: ['cleanup-plan'] })
}

/** Mark one file Keep or Trash. The screen changes at once; on failure the change is rolled back. */
export function useSelectAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: Selection) => duplicateService.select(v.entryId, v.action),
    onMutate: async (v) => ({ snapshot: await patchCaches(qc, (id) => (id === v.entryId ? v.action : undefined)) }),
    onError: (_e, _v, ctx) => restore(qc, ctx?.snapshot),
    onSettled: () => refresh(qc),
  })
}

/**
 * Apply the suggestion (keep the suggested copy, mark the others for Trash) to some groups or all of them.
 * For listed groups the screen updates at once, and `previous` holds the earlier choices for Undo.
 */
export function useApplySuggestions(kind: 'exact' | 'near' = 'exact') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { scope: number[] | 'all'; previous?: Selection[] }) => duplicateService.applySuggestions(v.scope, kind),
    onMutate: async (v) => {
      if (v.scope === 'all') return { snapshot: undefined }
      const ids = new Set(v.scope)
      const inScope = new Set<number>()
      for (const [, page] of qc.getQueriesData<DuplicatePage>({ queryKey: ['dup-groups', kind] })) {
        page?.items.filter((g) => ids.has(g.id)).forEach((g) => g.files.forEach((e) => inScope.add(e.entry_id)))
      }
      return {
        snapshot: await patchCaches(qc, (id, current, recommended) => (inScope.has(id) ? recommended : current)),
      }
    },
    onError: (_e, _v, ctx) => restore(qc, ctx?.snapshot),
    onSettled: () => refresh(qc),
  })
}

/** Put back earlier choices (Undo after a bulk change), a few requests at a time. */
export function useRestoreSelections() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (selections: Selection[]) => {
      const queue = [...selections]
      const worker = async () => {
        for (let s = queue.shift(); s; s = queue.shift()) await duplicateService.select(s.entryId, s.action)
      }
      await Promise.all(Array.from({ length: Math.min(6, queue.length) }, worker))
    },
    onMutate: async (selections) => {
      const map = new Map(selections.map((s) => [s.entryId, s.action]))
      return { snapshot: await patchCaches(qc, (id) => (map.has(id) ? map.get(id)! : undefined)) }
    },
    onError: (_e, _v, ctx) => restore(qc, ctx?.snapshot),
    onSettled: () => refresh(qc),
  })
}
