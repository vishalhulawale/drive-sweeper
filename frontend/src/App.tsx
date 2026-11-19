import Alert from '@cloudscape-design/components/alert'
import Box from '@cloudscape-design/components/box'
import Button from '@cloudscape-design/components/button'
import Spinner from '@cloudscape-design/components/spinner'
import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useDelayedFlag } from './components/loading/useDelayedFlag'
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

const centred = { minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 } as const

export default function App() {
  const auth = useAuthStatus()
  const slow = useDelayedFlag(auth.isLoading)

  if (auth.isLoading) {
    return (
      <div style={centred}>
        {slow && (
          <Box color="text-body-secondary">
            <Spinner size="large" /> Connecting to DriveClean
          </Box>
        )}
      </div>
    )
  }
  if (auth.isError) {
    return (
      <div style={centred}>
        <div style={{ maxWidth: 560 }}>
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
