import { BrushCleaning, ExternalLink, Menu, Moon, Settings as SettingsIcon, Sun, X } from 'lucide-react'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import PageErrorBoundary from '../components/common/PageErrorBoundary'
import PageSkeleton from '../components/loading/PageSkeleton'
import { cx, SearchInput } from '../components/ui/core'
import { useCleanupPlan } from '../hooks/useCleanup'
import { useDuplicateSummary } from '../hooks/useDuplicates'
import { useAuthStatus } from '../hooks/useGoogleDrive'
import { useNearStatus } from '../hooks/useNear'
import { setPreferences, usePreferences } from '../theme/preferences'
import { HelpContext } from './help'
import HelpContent from './HelpContent'
import { APP_NAME, DRIVE_URL, NAV_FOOTER, NAV_GROUPS, PAGES, pageFor, type PageKey } from './navigation'
import { NotificationsBar, NotificationsProvider } from './NotificationsProvider'
import { useBackendStatus } from './useBackendStatus'
import { useJobNotifications } from './useJobNotifications'
import { useNotificationsState } from './useNotificationsState'

/** Live counts shown next to menu items; hidden until known and when zero. */
function useNavCounts(): Partial<Record<PageKey, number>> {
  const dups = useDuplicateSummary()
  const near = useNearStatus()
  const plan = useCleanupPlan()
  return { duplicates: dups.data?.groups, similar: near.data?.groups, cleanup: plan.data?.count }
}

const navLink = (isActive: boolean) =>
  cx(
    'flex items-center justify-between gap-2 border-l-2 px-2 py-1',
    isActive
      ? 'border-brand-600 font-bold text-brand-600 dark:text-brand-500'
      : 'border-transparent text-muted hover:text-brand-600 dark:text-slate-300 dark:hover:text-brand-500',
  )

/** The connected Google account: email and a link to Settings. */
function AccountButton() {
  const auth = useAuthStatus()
  const [open, setOpen] = useState(false)
  const email = auth.data?.email ?? 'Account'
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-label={`Account: ${email}`}
        aria-expanded={open}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-xs font-bold uppercase"
      >
        {email.charAt(0)}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-64 border border-line bg-white p-3 text-sm text-ink shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <p className="truncate font-semibold">{email}</p>
            <p className="mt-0.5 text-xs text-slate-500">Connected Google account</p>
            <Link
              to={PAGES.settings.href}
              onClick={() => setOpen(false)}
              className="mt-3 flex w-full items-center gap-1.5 border border-line px-2 py-1.5 text-xs font-semibold hover:border-brand-500 hover:text-brand-600 dark:border-slate-700"
            >
              <SettingsIcon size={13} /> Settings
            </Link>
          </div>
        </>
      )}
    </div>
  )
}

/** Search box at the top of the menu: jumps to Files with the name search filled in. */
function FileSearch({ onDone }: { onDone?: () => void }) {
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const go = () => {
    const t = q.trim()
    if (!t) return
    navigate(`/files?q=${encodeURIComponent(t)}`)
    setQ('')
    onDone?.()
  }
  return <SearchInput value={q} onChange={setQ} onEnter={go} placeholder="Search file names…" />
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const counts = useNavCounts()
  const { pathname } = useLocation()
  const page = pageFor(pathname)

  const item = (k: PageKey, nested = false) => {
    const n = counts[k]
    return (
      <NavLink key={k} to={PAGES[k].href} end onClick={onNavigate} className={({ isActive }) => cx(navLink(isActive), nested && '-ml-px')}>
        <span>{PAGES[k].title}</span>
        {n ? (
          <span className={cx('shrink-0 px-1.5 py-0.5 text-[10px] font-semibold', k === 'cleanup' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')}>
            {n.toLocaleString()}
          </span>
        ) : null}
      </NavLink>
    )
  }

  return (
    <nav className="space-y-1 text-sm" aria-label="Main menu">
      <FileSearch onDone={onNavigate} />
      <div className="space-y-0.5 py-3">{item('dashboard')}</div>
      {NAV_GROUPS.map((g, gi) => (
        <details key={g.title} open className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between px-2 py-1.5 font-bold text-ink hover:text-brand-600 dark:text-slate-200">
            <span><span className="mr-1.5 text-xs text-slate-400">{gi + 1}</span>{g.title}</span>
            {g.pages.includes(page) && <span className="h-1.5 w-1.5 bg-brand-600" aria-hidden />}
          </summary>
          <div className="mb-2 ml-2 space-y-0.5 border-l border-line dark:border-slate-700">{g.pages.map((k) => item(k, true))}</div>
        </details>
      ))}
      <div className="space-y-0.5 border-t border-line pt-3 dark:border-slate-700">
        {NAV_FOOTER.map((k) => item(k))}
        <a href={DRIVE_URL} target="_blank" rel="noreferrer" className={navLink(false)}>
          <span>Google Drive</span>
          <ExternalLink size={13} aria-label="(opens in a new tab)" />
        </a>
      </div>
    </nav>
  )
}

/** The help panel, docked to the right like a reader's margin note. */
function HelpDrawer({ page, open, onClose }: { page: PageKey; open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <aside
      aria-label="Help panel"
      className="fixed inset-y-0 right-0 top-12 z-30 w-80 max-w-[90vw] overflow-y-auto border-l border-line bg-white p-5 shadow-lg dark:border-slate-700 dark:bg-squid-dark xl:sticky xl:h-[calc(100vh-3rem)] xl:shadow-none"
    >
      <button onClick={onClose} aria-label="Close help panel" className="float-right -mr-1 -mt-1 p-1 text-slate-500 hover:text-ink dark:hover:text-white"><X size={18} /></button>
      <HelpContent page={page} />
    </aside>
  )
}

export default function AppShell() {
  const { pathname } = useLocation()
  const page = pageFor(pathname)
  const prefs = usePreferences()
  const notifications = useNotificationsState()
  useBackendStatus(notifications.api)
  useJobNotifications(notifications.api)
  const [navOpen, setNavOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const dark = prefs.mode === 'dark'

  useEffect(() => {
    document.title = page === 'dashboard' ? APP_NAME : `${PAGES[page].title} · ${APP_NAME}`
  }, [page])
  // Block body on purpose: newer Chrome returns a Promise from scrollTo(), which React would call as the cleanup.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  const help = useMemo(() => ({ openHelp: () => setHelpOpen(true) }), [])

  return (
    <NotificationsProvider value={notifications.api}>
      <HelpContext.Provider value={help}>
        <div className="min-h-screen">
          <header className="sticky top-0 z-20 bg-squid text-white shadow-[0_1px_1px_rgba(0,7,22,0.15)]">
            <div className="flex h-12 items-center gap-3 px-4">
              <button className="lg:hidden" onClick={() => setNavOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
              <Link to="/" className="flex items-center gap-2 text-[15px] font-bold hover:text-aws-orange">
                <BrushCleaning size={20} className="text-aws-orange" /> {APP_NAME}
              </Link>
              <span className="hidden text-sm text-[#d1d5db] sm:inline">Free up Google Drive storage, safely</span>
              <div className="flex-1" />
              <a href={DRIVE_URL} target="_blank" rel="noreferrer" className="hidden items-center gap-1.5 text-sm text-[#d1d5db] hover:text-white md:flex">
                Open Google Drive <ExternalLink size={13} aria-label="(opens in a new tab)" />
              </a>
              <button
                onClick={() => setPreferences({ theme: dark ? 'light' : 'dark' })}
                aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
                title={dark ? 'Light theme' : 'Dark theme'}
                className="p-1.5 text-[#d1d5db] hover:text-white"
              >
                {dark ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <AccountButton />
            </div>
          </header>
          <div className="flex">
            <aside className="sticky top-12 hidden h-[calc(100vh-3rem)] w-72 shrink-0 overflow-y-auto border-r border-line bg-white p-4 [scrollbar-gutter:stable] lg:block dark:border-slate-700 dark:bg-squid-dark">
              <Sidebar />
            </aside>
            {navOpen && (
              <div className="fixed inset-0 z-40 lg:hidden">
                <div className="absolute inset-0 bg-black/40" onClick={() => setNavOpen(false)} />
                <div className="absolute inset-y-0 left-0 w-80 max-w-[85vw] overflow-y-auto bg-white p-4 dark:bg-squid-dark">
                  <button className="mb-3" onClick={() => setNavOpen(false)} aria-label="Close menu"><X size={20} /></button>
                  <Sidebar onNavigate={() => setNavOpen(false)} />
                </div>
              </div>
            )}
            <main className="min-w-0 flex-1 px-4 py-8 sm:px-8">
              <div className="mx-auto max-w-[1400px]">
                <NotificationsBar items={notifications.items} onDismiss={notifications.api.dismiss} />
                <PageErrorBoundary key={pathname}>
                  <Suspense fallback={<PageSkeleton />}><Outlet /></Suspense>
                </PageErrorBoundary>
              </div>
            </main>
            <HelpDrawer page={page} open={helpOpen} onClose={() => setHelpOpen(false)} />
          </div>
        </div>
      </HelpContext.Provider>
    </NotificationsProvider>
  )
}
