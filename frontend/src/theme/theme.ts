import { applyTheme } from '@cloudscape-design/components/theming'

const SANS = "'Geist Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
const MONO = "'Geist Mono Variable', ui-monospace, 'Cascadia Mono', Consolas, monospace"

/** Brand teal: logo, favicon and the "space you can free" bar only. Actions stay Cloudscape blue. */
export const BRAND = { light: '#0f7b8a', dark: '#3fb6c4' } as const

export const FONT_SANS = SANS

/** Cloudscape token overrides. Kept small on purpose so the app still reads as a console. */
export function applyAppTheme() {
  applyTheme({
    theme: {
      tokens: {
        fontFamilyBase: SANS,
        fontFamilyHeading: SANS,
        fontFamilyDisplay: SANS,
        fontFamilyMonospace: MONO,
      },
    },
  })
}
