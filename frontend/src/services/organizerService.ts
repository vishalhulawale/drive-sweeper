import type { Operation } from '../types/cleanup'
import type { Move, SuggestionPage } from '../types/organizer'
import { api } from './api'

export const organizerService = {
  suggestions: (source: string) =>
    api.get<SuggestionPage>('/api/organizer/suggestions', { params: { source } }).then((r) => r.data),
  apply: (moves: Move[]) => api.post<Operation[]>('/api/organizer/apply', { moves }).then((r) => r.data),
  history: () => api.get<Operation[]>('/api/organizer/history').then((r) => r.data),
  undo: (id: number) => api.post<Operation>(`/api/organizer/operations/${id}/undo`).then((r) => r.data),
}
