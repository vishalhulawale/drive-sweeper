import { BrushCleaning, CircleCheck } from 'lucide-react'
import { Alert } from '../components/ui/core'
import { authService } from '../services/authService'

const ERRORS: Record<string, string> = {
  access_denied:
    'Google denied access. Make sure your account is listed as a test user for the OAuth app, and that you approved the request.',
  missing_drive_scope:
    "The Google Drive permission was not granted. On Google's consent screen, tick the box allowing DriveClean to view your Drive file metadata, then try again.",
  callback_failed: 'Sign-in could not be completed. Check the backend logs and try again.',
}

const PROMISES = [
  'Reads file details only (names, sizes, dates, checksums)',
  'Never downloads your files',
  'Nothing moves to Trash without your approval, and Trash can be undone for 30 days',
]

export default function ConnectPage() {
  const code = new URLSearchParams(window.location.search).get('auth_error')
  return (
    <div className="min-h-screen">
      <header className="bg-squid text-white">
        <div className="flex h-12 items-center gap-2 px-4 text-[15px] font-bold">
          <BrushCleaning size={20} className="text-aws-orange" /> DriveClean
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-16">
        <h1 className="text-3xl font-bold tracking-tight">Connect your Google Drive</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Find duplicate files and similar photos, review them, and free up space safely.
        </p>
        <ul className="mt-6 space-y-2 border border-line p-4 dark:border-slate-700">
          {PROMISES.map((p) => (
            <li key={p} className="flex items-start gap-2">
              <CircleCheck size={17} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
              <span>{p}</span>
            </li>
          ))}
        </ul>
        {code && (
          <div className="mt-4">
            <Alert type="error" header="Sign-in failed">{ERRORS[code] ?? `Google returned "${code}". Try again.`}</Alert>
          </div>
        )}
        <a
          href={authService.loginUrl}
          className="mt-6 flex w-full items-center justify-center border border-brand-600 bg-brand-600 px-4 py-2.5 font-semibold text-white hover:bg-brand-900"
        >
          Connect Google Drive
        </a>
      </main>
    </div>
  )
}
