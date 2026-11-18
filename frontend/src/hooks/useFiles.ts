import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fileService } from '../services/fileService'
import type { FileQuery } from '../types/file'

export function useFiles(query: FileQuery) {
  return useQuery({
    queryKey: ['files', query],
    queryFn: () => fileService.list(query),
    placeholderData: keepPreviousData,
  })
}

export function useInventorySummary(refetchMs: number | false = false) {
  return useQuery({
    queryKey: ['summary'],
    queryFn: fileService.summary,
    refetchInterval: refetchMs,
  })
}

export function useFolderPath(folderId: string) {
  return useQuery({
    queryKey: ['path', folderId],
    queryFn: () => fileService.path(folderId),
    enabled: folderId !== 'root',
  })
}
