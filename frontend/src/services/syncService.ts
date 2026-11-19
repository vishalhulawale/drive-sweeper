import { api } from './api'

export interface SyncStatus {
  available: boolean
  last_sync_at: string | null
  auto_sync_enabled: boolean
  auto_sync_minutes: number
  last_error: string | null
}

export interface SyncResult {
  updated: number
  removed: number
  last_sync_at: string | null
}

export const syncService = {
  status: () => api.get<SyncStatus>('/api/sync/status').then((r) => r.data),
  saveSettings: (enabled: boolean, minutes: number) =>
    api.put<SyncStatus>('/api/sync/settings', { enabled, minutes }).then((r) => r.data),
  run: () => api.post<SyncResult>('/api/sync').then((r) => r.data),
}
