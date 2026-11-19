import { API_URL, api } from './api'

export interface NearStatus {
  running: boolean
  last_error: string | null
  eligible: number
  hashed: number
  unhashable: number
  pending: number
  groups: number
  similar_files: number
  potential_savings: number
}

export const nearService = {
  status: () => api.get<NearStatus>('/api/near-duplicates/status').then((r) => r.data),
  start: () => api.post<NearStatus>('/api/near-duplicates/start').then((r) => r.data),
  cancel: () => api.post<NearStatus>('/api/near-duplicates/cancel').then((r) => r.data),
  detect: () => api.post<NearStatus>('/api/near-duplicates/detect').then((r) => r.data),
  thumbnailUrl: (googleFileId: string, size = 200) =>
    `${API_URL}/api/near-duplicates/thumbnail/${encodeURIComponent(googleFileId)}?size=${size}`,
}
