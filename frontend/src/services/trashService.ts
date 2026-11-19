import type { TrashOverview, TrashPage, TrashSort } from '../types/trash'
import { api } from './api'

export const trashService = {
  overview: () => api.get<TrashOverview>('/api/trash/overview').then((r) => r.data),
  items: (sort: TrashSort, page: number, pageSize: number) =>
    api.get<TrashPage>('/api/trash/items', { params: { sort, page, page_size: pageSize } }).then((r) => r.data),
  refreshDates: () =>
    api.post<{ seen: number; updated: number }>('/api/trash/refresh-dates').then((r) => r.data),
}
