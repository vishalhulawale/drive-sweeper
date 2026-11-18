import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authService } from '../services/authService'

export function useAuthStatus() {
  return useQuery({ queryKey: ['auth'], queryFn: authService.status, retry: false })
}

export function useDisconnect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: authService.disconnect,
    onSuccess: () => qc.invalidateQueries(),
  })
}
