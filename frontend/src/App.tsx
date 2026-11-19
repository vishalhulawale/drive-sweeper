import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useDelayedFlag } from './components/loading/useDelayedFlag'
import { Alert, Button, Spinner } from './components/ui/core'
import { useAuthStatus } from './hooks/useGoogleDrive'
import AppShell from './layouts/AppShell'
import { errorMessage } from './services/api'

// Each page is its own chunk; AppShell shows a page-shaped placeholder while one loads.
const ConnectPage = lazy(() => import('./pages/ConnectPage'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const FileExplorer = lazy(() => import('./pages/FileExplorer'))
const Analytics = lazy(() => import('./pages/Analytics'))
const Duplicates = lazy(() => import('./pages/Duplicates'))
const SimilarPhotos = lazy(() => import('./pages/SimilarPhotos'))
const Organizer = lazy(() => import('./pages/Organizer'))
const Cleanup = lazy(() => import('./pages/Cleanup'))
const Trash = lazy(() => import('./pages/Trash'))
const ScanHistory = lazy(() => import('./pages/ScanHistory'))
const Settings = lazy(() => import('./pages/Settings'))

export default function App() {
  const auth = useAuthStatus()
  const slow = useDelayedFlag(auth.isLoading)

  if (auth.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center p-4">
        {slow && <p className="flex items-center gap-2 text-slate-500"><Spinner size={20} /> Connecting to DriveClean</p>}
      </div>
    )
  }
  if (auth.isError) {
    return (
      <div className="grid min-h-screen place-items-center p-4">
        <div className="w-full max-w-xl">
          <Alert type="error" header="Can't reach DriveClean" action={<Button onClick={() => auth.refetch()}>Retry</Button>}>
            {errorMessage(auth.error)}
          </Alert>
        </div>
      </div>
    )
  }
  if (!auth.data?.connected) return <ConnectPage />

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="files" element={<FileExplorer />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="duplicates" element={<Duplicates />} />
        <Route path="similar" element={<SimilarPhotos />} />
        <Route path="organizer" element={<Organizer />} />
        <Route path="trash" element={<Trash />} />
        <Route path="cleanup" element={<Cleanup />} />
        <Route path="scans" element={<ScanHistory />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
