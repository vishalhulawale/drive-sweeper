import { applyDensity, applyMode, Density, Mode } from '@cloudscape-design/global-styles'
import { useSyncExternalStore } from 'react'

/** Display preferences: light theme and comfortable density by default. */
export type ThemePref = 'light' | 'dark' | 'system'
export type DensityPref = 'comfortable' | 'compact'
export interface Preferences {
  theme: ThemePref
  density: DensityPref
}

const KEY = 'driveclean.display'
const DEFAULTS: Preferences = { theme: 'light', density: 'comfortable' }

function load(): Preferences {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const p = JSON.parse(raw) as Partial<Preferences>
    return {
      theme: p.theme === 'dark' || p.theme === 'system' ? p.theme : 'light',
      density: p.density === 'compact' ? 'compact' : 'comfortable',
    }
  } catch {
    return DEFAULTS
  }
}

let current = load()
const listeners = new Set<() => void>()
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

/** The mode actually shown, after resolving "system". */
export function resolvedMode(p: Preferences = current): 'light' | 'dark' {
  if (p.theme === 'system') return media?.matches ? 'dark' : 'light'
  return p.theme
}

function apply() {
  const mode = resolvedMode()
  applyMode(mode === 'dark' ? Mode.Dark : Mode.Light)
  applyDensity(current.density === 'compact' ? Density.Compact : Density.Comfortable)
  document.documentElement.style.colorScheme = mode
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? '#161d26' : '#ffffff')
}

export function initPreferences() {
  apply()
  media?.addEventListener('change', () => {
    if (current.theme !== 'system') return
    apply()
    listeners.forEach((l) => l())
  })
}

export function setPreferences(patch: Partial<Preferences>) {
  current = { ...current, ...patch }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // Storage unavailable (private window, blocked site data): keep the choice for this session only.
  }
  apply()
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Current preferences plus the resolved mode; re-renders when either changes. */
export function usePreferences() {
  const prefs = useSyncExternalStore(subscribe, () => current)
  const mode = useSyncExternalStore(subscribe, () => resolvedMode())
  return { ...prefs, mode }
}
