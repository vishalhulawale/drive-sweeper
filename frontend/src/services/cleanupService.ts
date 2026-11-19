import type { CleanupPlan, Operation } from '../types/cleanup'
import { api } from './api'

export const cleanupService = {
  plan: () => api.get<CleanupPlan>('/api/cleanup/plan').then((r) => r.data),
  execute: (expectedCount: number) =>
    api.post<Operation[]>('/api/cleanup/execute', { expected_count: expectedCount }).then((r) => r.data),
  operations: () => api.get<Operation[]>('/api/cleanup/operations').then((r) => r.data),
  restore: (id: number) => api.post<Operation>(`/api/cleanup/operations/${id}/restore`).then((r) => r.data),
}
