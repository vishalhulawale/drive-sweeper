import { useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useEffect, useRef } from 'react'
import { api, API_URL } from '../services/api'
import type { NotificationsApi } from './notifications'

const ID = 'backend-unreachable'

/**
 * Shows one persistent notification when the backend can't be reached, checks it again with backoff,
 * and on recovery removes the notice and refreshes every query.
 */
export function useBackendStatus({ notify, dismiss }: NotificationsApi) {
  const qc = useQueryClient()
  const down = useRef(false)

  useEffect(() => {
    let timer: number | undefined
    let delay = 2000

    const check = async () => {
      try {
        await api.get('/api/health', { timeout: 5000 })
        down.current = false
        delay = 2000
        dismiss(ID)
        qc.invalidateQueries()
      } catch {
        delay = Math.min(delay * 2, 30000)
        timer = window.setTimeout(check, delay)
      }
    }

    const unsubscribe = qc.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || down.current) return
      const err = event.query.state.error
      if (!(axios.isAxiosError(err) && err.code === 'ERR_NETWORK')) return
      down.current = true
      notify({
        id: ID,
        type: 'warning',
        header: "Can't reach the DriveClean server",
        content: `Nothing on this page is lost. Checking ${API_URL} again automatically.`,
        dismissible: false,
      })
      timer = window.setTimeout(check, delay)
    })

    return () => {
      unsubscribe()
      window.clearTimeout(timer)
    }
  }, [qc, notify, dismiss])
}
