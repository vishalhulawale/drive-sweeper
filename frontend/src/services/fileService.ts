import type { FilePage, FileQuery, InventorySummary, PathNode } from '../types/file'
import { api } from './api'

export const fileService = {
  list: (q: FileQuery) =>
    api
      .get<FilePage>('/api/files', {
        params: {
          parent: q.q ? undefined : q.parent,
          q: q.q || undefined,
          trashed: q.trashed,
          sort: q.sort,
          order: q.order,
          page: q.page,
          page_size: q.pageSize,
        },
      })
      .then((r) => r.data),
  summary: () => api.get<InventorySummary>('/api/files/summary').then((r) => r.data),
  path: (id: string) => api.get<PathNode[]>(`/api/files/${id}/path`).then((r) => r.data),
}
