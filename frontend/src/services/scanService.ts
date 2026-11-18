import type { Scan } from '../types/scan'
import { api } from './api'

export const scanService = {
  list: () => api.get<Scan[]>('/api/scans').then((r) => r.data),
  start: () => api.post<Scan>('/api/scans').then((r) => r.data),
  resume: (id: number) => api.post<Scan>(`/api/scans/${id}/resume`).then((r) => r.data),
  cancel: (id: number) => api.post<Scan>(`/api/scans/${id}/cancel`).then((r) => r.data),
}
