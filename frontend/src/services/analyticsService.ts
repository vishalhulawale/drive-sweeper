import type { FolderUsage, LargestFiles, Overview, YearUsage } from '../types/analytics'
import { api } from './api'

export const analyticsService = {
  overview: () => api.get<Overview>('/api/analytics/overview').then((r) => r.data),
  byYear: () => api.get<YearUsage[]>('/api/analytics/by-year').then((r) => r.data),
  largestFiles: (limit = 25) =>
    api.get<LargestFiles>('/api/analytics/largest-files', { params: { limit } }).then((r) => r.data),
  largestFolders: (limit = 25) =>
    api.get<FolderUsage[]>('/api/analytics/largest-folders', { params: { limit } }).then((r) => r.data),
}
