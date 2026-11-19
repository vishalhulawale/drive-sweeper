import type { ArchiveList, ArchiveStatus, Extraction } from '../types/archive'
import { api } from './api'

export const archiveService = {
  list: (ownedOnly: boolean) => api.get<ArchiveList>('/api/archives', { params: { owned: ownedOnly } }).then((r) => r.data),
  extract: (fileIds: number[]) => api.post<ArchiveStatus>('/api/archives/extract', { file_ids: fileIds }).then((r) => r.data),
  status: () => api.get<ArchiveStatus>('/api/archives/status').then((r) => r.data),
  cancel: () => api.post<ArchiveStatus>('/api/archives/cancel').then((r) => r.data),
  history: () => api.get<Extraction[]>('/api/archives/history').then((r) => r.data),
}
