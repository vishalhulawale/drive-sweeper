/** Routes, page titles and side-menu grouping, in the order of the work: scan, find, review, trash. */
export interface NavPage {
  href: string
  title: string
}

export const PAGES = {
  dashboard: { href: '/', title: 'Dashboard' },
  files: { href: '/files', title: 'Files' },
  analytics: { href: '/analytics', title: 'Storage analytics' },
  duplicates: { href: '/duplicates', title: 'Duplicates' },
  similar: { href: '/similar', title: 'Similar photos' },
  organizer: { href: '/organizer', title: 'Organizer' },
  cleanup: { href: '/cleanup', title: 'Cleanup' },
  trash: { href: '/trash', title: 'Trash' },
  scans: { href: '/scans', title: 'Scan history' },
  settings: { href: '/settings', title: 'Settings' },
} satisfies Record<string, NavPage>

export type PageKey = keyof typeof PAGES

export const NAV_GROUPS: { title: string; pages: PageKey[] }[] = [
  { title: 'Storage', pages: ['files', 'analytics'] },
  { title: 'Find and review', pages: ['duplicates', 'similar', 'organizer'] },
  { title: 'Clean up', pages: ['cleanup', 'trash'] },
]
export const NAV_FOOTER: PageKey[] = ['scans', 'settings']

/** The page whose route matches a pathname (exact, or the first path segment). */
export function pageFor(pathname: string): PageKey {
  const first = '/' + (pathname.split('/')[1] ?? '')
  const hit = (Object.keys(PAGES) as PageKey[]).find((k) => PAGES[k].href === first)
  return hit ?? 'dashboard'
}

export const APP_NAME = 'DriveClean'
export const DRIVE_URL = 'https://drive.google.com/drive/my-drive'
