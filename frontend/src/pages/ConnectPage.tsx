import Alert from '@cloudscape-design/components/alert'
import Box from '@cloudscape-design/components/box'
import Button from '@cloudscape-design/components/button'
import Container from '@cloudscape-design/components/container'
import Icon from '@cloudscape-design/components/icon'
import SpaceBetween from '@cloudscape-design/components/space-between'
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
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <Container>
          <SpaceBetween size="l">
            <SpaceBetween size="s" direction="horizontal" alignItems="center">
              <img src="/favicon.svg" alt="" width={40} height={40} />
              <Box variant="h1" fontSize="heading-xl" padding="n">DriveClean</Box>
            </SpaceBetween>
            <SpaceBetween size="xs">
              <Box variant="h2" padding="n">Connect your Google Drive</Box>
              <Box color="text-body-secondary">
                Find duplicate files and similar photos, review them, and free up space safely.
              </Box>
            </SpaceBetween>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
              {PROMISES.map((p) => (
                <li key={p} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <Icon name="status-positive" variant="success" />
                  <Box variant="span">{p}</Box>
                </li>
              ))}
            </ul>
            {code && (
              <Alert type="error" header="Sign-in failed">
                {ERRORS[code] ?? `Google returned "${code}". Try again.`}
              </Alert>
            )}
            <Button variant="primary" href={authService.loginUrl} fullWidth>
              Connect Google Drive
            </Button>
          </SpaceBetween>
        </Container>
      </div>
    </main>
  )
}
