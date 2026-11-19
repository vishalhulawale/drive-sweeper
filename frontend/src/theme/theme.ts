import { fontFamilyBase, fontFamilyDisplay, fontFamilyHeading, fontFamilyMonospace } from '@cloudscape-design/design-tokens'

const SANS = "'Geist Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
const MONO = "'Geist Mono Variable', ui-monospace, 'Cascadia Mono', Consolas, monospace"

/** Brand teal: logo, favicon and the "space you can free" bar only. Actions stay Cloudscape blue. */
export const BRAND = { light: '#0f7b8a', dark: '#3fb6c4' } as const

export const FONT_SANS = SANS

/** The CSS custom property behind a design token, e.g. "var(--font-family-base-c9u5cr, ...)" -> "--font-family-base-c9u5cr". */
const varName = (token: string) => /var\((--[\w-]+)/.exec(token)?.[1]

/**
 * Swap Cloudscape's fonts for Geist. Cloudscape declares its tokens inside a CSS cascade layer, on body, so a plain
 * unlayered body rule wins. This avoids the runtime theming API (applyTheme), which adds about 1 MB to the bundle.
 */
export function applyAppTheme() {
  const pairs: [string, string][] = [
    [fontFamilyBase, SANS], [fontFamilyHeading, SANS], [fontFamilyDisplay, SANS], [fontFamilyMonospace, MONO],
  ]
  const rules = pairs.map(([token, value]) => {
    const name = varName(token)
    return name ? `${name}: ${value};` : ''
  }).join('\n  ')
  const style = document.createElement('style')
  style.dataset.driveclean = 'fonts'
  style.textContent = `:root, body {\n  ${rules}\n}`
  document.head.appendChild(style)
}
