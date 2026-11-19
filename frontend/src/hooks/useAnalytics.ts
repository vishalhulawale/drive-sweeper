import { useQuery } from '@tanstack/react-query'
import { analyticsService } from '../services/analyticsService'

export const useOverview = () => useQuery({ queryKey: ['an-overview'], queryFn: analyticsService.overview })
export const useByYear = () => useQuery({ queryKey: ['an-year'], queryFn: analyticsService.byYear })
export const useLargestFiles = () =>
  useQuery({ queryKey: ['an-files'], queryFn: () => analyticsService.largestFiles(25) })
export const useLargestFolders = () =>
  useQuery({ queryKey: ['an-folders'], queryFn: () => analyticsService.largestFolders(25) })
