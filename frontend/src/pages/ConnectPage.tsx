import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { authService } from '../services/authService'

const ERRORS: Record<string, string> = {
  access_denied:
    'Google denied access. Make sure your account is listed as a test user for the OAuth app, and that you approved the request.',
  missing_drive_scope:
    'The Google Drive permission was not granted. On Google\'s consent screen, tick the box allowing DriveClean to view your Drive file metadata, then try again.',
  callback_failed: 'Sign-in could not be completed. Check the backend logs and try again.',
}

export default function ConnectPage() {
  const code = new URLSearchParams(window.location.search).get('auth_error')
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Paper variant="outlined" sx={{ p: 4, maxWidth: 520 }}>
        <Typography variant="h4" gutterBottom>
          DriveClean
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Scan your Google Drive, find exact duplicate files, and review them before anything is moved to Trash.
          DriveClean only reads file metadata while scanning, never downloads your files, and never deletes
          anything without your approval.
        </Typography>
        {code && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {ERRORS[code] ?? `Sign-in failed (${code}).`}
          </Alert>
        )}
        <Button variant="contained" size="large" href={authService.loginUrl}>
          Connect Google Drive
        </Button>
      </Paper>
    </Box>
  )
}
