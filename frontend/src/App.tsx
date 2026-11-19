import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuthStatus } from './hooks/useGoogleDrive'
import MainLayout from './layouts/MainLayout'
import ConnectPage from './pages/ConnectPage'
import Analytics from './pages/Analytics'
import Cleanup from './pages/Cleanup'
import Dashboard from './pages/Dashboard'
import Duplicates from './pages/Duplicates'
import FileExplorer from './pages/FileExplorer'
import ScanHistory from './pages/ScanHistory'
import Settings from './pages/Settings'
import { errorMessage } from './services/api'

export default function App() {
  const auth = useAuthStatus()

  if (auth.isLoading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    )
  }
  if (auth.isError) {
    return (
      <Box sx={{ p: 4, maxWidth: 560, mx: 'auto' }}>
        <Alert severity="error" action={<Button onClick={() => auth.refetch()}>Retry</Button>}>
          {errorMessage(auth.error)}
        </Alert>
      </Box>
    )
  }
  if (!auth.data?.connected) return <ConnectPage />

  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="files" element={<FileExplorer />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="duplicates" element={<Duplicates />} />
        <Route path="cleanup" element={<Cleanup />} />
        <Route path="scans" element={<ScanHistory />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
