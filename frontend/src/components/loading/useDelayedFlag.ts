import { useEffect, useState } from 'react'

/**
 * True only once `active` has stayed true for `delayMs`. Loads that finish quickly show no indicator at all,
 * so the screen doesn't flicker.
 */
export function useDelayedFlag(active: boolean, delayMs = 300): boolean {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!active) return
    const t = window.setTimeout(() => setShown(true), delayMs)
    return () => {
      window.clearTimeout(t)
      setShown(false)
    }
  }, [active, delayMs])
  return active && shown
}
