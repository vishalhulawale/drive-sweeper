import { API_URL, api } from './api'

export interface AuthStatus {
  connected: boolean
  email: string | null
}

export const authService = {
  status: () => api.get<AuthStatus>('/api/auth/status').then((r) => r.data),
  disconnect: () => api.post('/api/auth/disconnect').then((r) => r.data),
  loginUrl: `${API_URL}/api/auth/google`,
}
