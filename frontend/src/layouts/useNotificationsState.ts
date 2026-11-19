import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Notice } from './notifications'

/** State behind the page-top notifications; owned by AppShell. */
export function useNotificationsState() {
  const [items, setItems] = useState<Notice[]>([])
  const timers = useRef(new Map<string, number>())

  const dismiss = useCallback((id: string) => {
    window.clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setItems((xs) => xs.filter((x) => x.id !== id))
  }, [])

  const notify = useCallback(
    (n: Notice) => {
      setItems((xs) => {
        const i = xs.findIndex((x) => x.id === n.id)
        if (i === -1) return [n, ...xs]
        const next = xs.slice()
        next[i] = n
        return next
      })
      window.clearTimeout(timers.current.get(n.id))
      if (n.autoDismissMs) timers.current.set(n.id, window.setTimeout(() => dismiss(n.id), n.autoDismissMs))
    },
    [dismiss],
  )

  useEffect(() => {
    const t = timers.current
    return () => t.forEach((h) => window.clearTimeout(h))
  }, [])

  const api = useMemo(() => ({ notify, dismiss }), [notify, dismiss])
  return { items, api }
}
