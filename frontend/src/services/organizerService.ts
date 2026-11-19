import type { Operation } from '../types/cleanup'
import type { ContentStatus, Move, SuggestMethod, SuggestionPage } from '../types/organizer'
import { api } from './api'

export const organizerService = {
  suggestions: (source: string, method: SuggestMethod) =>
    api.get<SuggestionPage>('/api/organizer/suggestions', { params: { source, method } }).then((r) => r.data),
  apply: (moves: Move[]) => api.post<Operation[]>('/api/organizer/apply', { moves }).then((r) => r.data),
  history: () => api.get<Operation[]>('/api/organizer/history').then((r) => r.data),
  undo: (id: number) => api.post<Operation>(`/api/organizer/operations/${id}/undo`).then((r) => r.data),
  contentStatus: (source: string) =>
    api.get<ContentStatus>('/api/organizer/content/status', { params: { source } }).then((r) => r.data),
  startContent: (source: string) =>
    api.post<ContentStatus>('/api/organizer/content/start', null, { params: { source } }).then((r) => r.data),
  cancelContent: (source: string) =>
    api.post<ContentStatus>('/api/organizer/content/cancel', null, { params: { source } }).then((r) => r.data),
}
