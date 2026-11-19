import type {
  DuplicateAction, DuplicateEntry, DuplicatePage, DuplicateSort, DuplicateSummary,
} from '../types/duplicate'
import { api } from './api'

export const duplicateService = {
  summary: () => api.get<DuplicateSummary>('/api/duplicates/summary').then((r) => r.data),
  detect: () => api.post<DuplicateSummary>('/api/duplicates/detect').then((r) => r.data),
  list: (sort: DuplicateSort, page: number, pageSize: number) =>
    api
      .get<DuplicatePage>('/api/duplicates', { params: { sort, page, page_size: pageSize } })
      .then((r) => r.data),
  select: (entryId: number, action: DuplicateAction | null) =>
    api
      .put<DuplicateEntry>(`/api/duplicates/entries/${entryId}/selection`, { action })
      .then((r) => r.data),
}
