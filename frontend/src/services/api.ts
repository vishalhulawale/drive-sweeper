import axios from 'axios'

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export const api = axios.create({ baseURL: API_URL })

export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (err.code === 'ERR_NETWORK') return 'Cannot reach the backend. Is it running on ' + API_URL + '?'
    return err.message
  }
  return err instanceof Error ? err.message : 'Unknown error'
}
