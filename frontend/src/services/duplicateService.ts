import type {
  DuplicateAction, DuplicateEntry, DuplicatePage, DuplicateSort, DuplicateSummary,
} from '../types/duplicate'
import { api } from './api'

export const duplicateService = {
  summary: () => api.get<DuplicateSummary>('/api/duplicates/summary').then((r) => r.data),
  detect: () => api.post<DuplicateSummary>('/api/duplicates/detect').then((r) => r.data),
  list: (sort: DuplicateSort, page: number, pageSize: number, kind: 'exact' | 'near' = 'exact') =>
    api
      .get<DuplicatePage>('/api/duplicates', { params: { kind, sort, page, page_size: pageSize } })
      .then((r) => r.data),
  // Keep the oldest copy in each group and mark the newer copies for Trash (records choices only).
  // Only groups of the given kind are changed (exact duplicates vs similar photos).
  applySuggestions: (scope: number[] | 'all', kind: 'exact' | 'near' = 'exact') =>
    api
      .post<DuplicateSummary>(
        '/api/duplicates/apply-suggestions',
        scope === 'all' ? { all_groups: true, kind } : { group_ids: scope, kind },
      )
      .then((r) => r.data),
  select: (entryId: number, action: DuplicateAction | null) =>
    api
      .put<DuplicateEntry>(`/api/duplicates/entries/${entryId}/selection`, { action })
      .then((r) => r.data),
}
