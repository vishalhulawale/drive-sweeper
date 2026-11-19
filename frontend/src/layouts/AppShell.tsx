import AppLayoutToolbar from '@cloudscape-design/components/app-layout-toolbar'
import Badge from '@cloudscape-design/components/badge'
import BreadcrumbGroup from '@cloudscape-design/components/breadcrumb-group'
import SideNavigation, { type SideNavigationProps } from '@cloudscape-design/components/side-navigation'
import TopNavigation from '@cloudscape-design/components/top-navigation'
import { useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useCleanupPlan } from '../hooks/useCleanup'
import { useDuplicateSummary } from '../hooks/useDuplicates'
import { useAuthStatus } from '../hooks/useGoogleDrive'
import { useNearStatus } from '../hooks/useNear'
import { setPreferences, usePreferences, type ThemePref } from '../theme/preferences'
import { HelpContext } from './help'
import HelpContent from './HelpContent'
import { APP_NAME, DRIVE_URL, NAV_FOOTER, NAV_GROUPS, PAGES, pageFor, type PageKey } from './navigation'
import { NotificationsBar, NotificationsProvider } from './NotificationsProvider'
import { useNotificationsState } from './useNotificationsState'

const THEMES: { id: ThemePref; text: string }[] = [
  { id: 'light', text: 'Light' },
  { id: 'dark', text: 'Dark' },
  { id: 'system', text: 'Match system' },
]

/** Live counts shown next to menu items; hidden until known and when zero. */
function useNavCounts(): Partial<Record<PageKey, number>> {
  const dups = useDuplicateSummary()
  const near = useNearStatus()
  const plan = useCleanupPlan()
  return { duplicates: dups.data?.groups, similar: near.data?.groups, cleanup: plan.data?.count }
}

export default function AppShell() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const page = pageFor(pathname)
  const auth = useAuthStatus()
  const prefs = usePreferences()
  const counts = useNavCounts()
  const notifications = useNotificationsState()
  const [navOpen, setNavOpen] = useState(true)
  const [toolsOpen, setToolsOpen] = useState(false)

  useEffect(() => {
    document.title = page === 'dashboard' ? APP_NAME : `${PAGES[page].title} · ${APP_NAME}`
  }, [page])

  const link = (k: PageKey): SideNavigationProps.Link => {
    const n = counts[k]
    return {
      type: 'link',
      text: PAGES[k].title,
      href: PAGES[k].href,
      info: n ? <Badge color={k === 'cleanup' ? 'severity-medium' : 'grey'}>{n.toLocaleString()}</Badge> : undefined,
    }
  }
  const navItems: SideNavigationProps.Item[] = [
    link('dashboard'),
    ...NAV_GROUPS.map(
      (g): SideNavigationProps.Section => ({ type: 'section', text: g.title, defaultExpanded: true, items: g.pages.map(link) }),
    ),
    { type: 'divider' },
    ...NAV_FOOTER.map(link),
    { type: 'link', text: 'Google Drive', href: DRIVE_URL, external: true, externalIconAriaLabel: '(opens in a new tab)' },
  ]

  const follow = (e: CustomEvent<{ href?: string; external?: boolean }>) => {
    const { href, external } = e.detail
    if (!href || external || /^https?:/.test(href)) return
    e.preventDefault()
    navigate(href)
  }

  const help = useMemo(() => ({ openHelp: () => setToolsOpen(true) }), [])
  const breadcrumbs = [{ text: APP_NAME, href: '/' }]
  if (page !== 'dashboard') breadcrumbs.push({ text: PAGES[page].title, href: PAGES[page].href })

  return (
    <NotificationsProvider value={notifications.api}>
      <HelpContext.Provider value={help}>
        <div id="top-nav" style={{ position: 'sticky', top: 0, zIndex: 1002 }}>
          <TopNavigation
            identity={{
              href: '/',
              title: APP_NAME,
              logo: { src: '/favicon.svg', alt: '' },
              onFollow: (e) => { e.preventDefault(); navigate('/') },
            }}
            utilities={[
              {
                type: 'button', text: 'Open Google Drive', href: DRIVE_URL, external: true,
                externalIconAriaLabel: '(opens in a new tab)',
              },
              {
                type: 'menu-dropdown',
                iconName: 'user-profile',
                text: auth.data?.email ?? 'Account',
                description: auth.data?.email ? 'Connected Google account' : undefined,
                items: [
                  { id: 'settings', text: 'Settings', href: PAGES.settings.href },
                  {
                    id: 'theme', text: 'Theme',
                    items: THEMES.map((t) => ({ id: `theme:${t.id}`, text: t.text, itemType: 'checkbox' as const, checked: prefs.theme === t.id })),
                  },
                ],
                onItemFollow: follow,
                onItemClick: (e) => {
                  const id = e.detail.id
                  if (id.startsWith('theme:')) setPreferences({ theme: id.slice(6) as ThemePref })
                  else if (id === 'settings') navigate(PAGES.settings.href)
                },
              },
            ]}
          />
        </div>
        <AppLayoutToolbar
          headerSelector="#top-nav"
          navigationOpen={navOpen}
          onNavigationChange={(e) => setNavOpen(e.detail.open)}
          navigation={
            <SideNavigation
              header={{ text: APP_NAME, href: '/' }}
              activeHref={PAGES[page].href}
              items={navItems}
              onFollow={follow}
            />
          }
          breadcrumbs={<BreadcrumbGroup items={breadcrumbs} onFollow={follow} ariaLabel="Breadcrumbs" />}
          notifications={<NotificationsBar items={notifications.items} onDismiss={notifications.api.dismiss} />}
          tools={<HelpContent page={page} />}
          toolsOpen={toolsOpen}
          onToolsChange={(e) => setToolsOpen(e.detail.open)}
          ariaLabels={{
            navigation: 'Main menu', navigationToggle: 'Open menu', navigationClose: 'Close menu',
            tools: 'Help panel', toolsToggle: 'Open help panel', toolsClose: 'Close help panel',
            notifications: 'Notifications',
          }}
          content={<Outlet />}
        />
      </HelpContext.Provider>
    </NotificationsProvider>
  )
}
