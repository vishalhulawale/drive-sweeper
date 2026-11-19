import { useEffect } from 'react'

export interface ReviewShortcuts {
  next: () => void
  previous: () => void
  keep: (entryId: number) => void
  trash: (entryId: number) => void
  applyToGroup: () => void
  compare: () => void
  help: () => void
}

/**
 * Keyboard review: J / K next or previous group, 1 keep and 2 trash the focused photo, A apply the suggestion to
 * the current group, C compare, ? help. Ignored while typing in a field or when a dialog is open.
 */
export function useReviewShortcuts(enabled: boolean, s: ReviewShortcuts) {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
      const entry = Number((document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-entry-id]')?.dataset.entryId)
      const handlers: Record<string, () => void> = {
        j: s.next, k: s.previous, a: s.applyToGroup, c: s.compare, '?': s.help,
        '1': () => entry && s.keep(entry),
        '2': () => entry && s.trash(entry),
      }
      const h = handlers[e.key.toLowerCase()]
      if (h) { e.preventDefault(); h() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, s])
}
