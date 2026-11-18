import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { useAuthStatus, useDisconnect } from '../hooks/useGoogleDrive'
import { errorMessage } from '../services/api'

export default function Settings() {
  const auth = useAuthStatus()
  const disconnect = useDisconnect()
  const [confirming, setConfirming] = useState(false)

  return (
    <Stack spacing={2}>
      <Typography variant="h4">Settings</Typography>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6">Google Drive connection</Typography>
          <Typography sx={{ mt: 1 }}>Connected as {auth.data?.email}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Disconnecting revokes DriveClean's access at Google and deletes the locally stored tokens and file
            inventory. Your Drive files are not touched.
          </Typography>
          {disconnect.isError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {errorMessage(disconnect.error)}
            </Alert>
          )}
          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            {confirming ? (
              <>
                <Button color="error" variant="contained" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
                  Yes, disconnect
                </Button>
                <Button onClick={() => setConfirming(false)}>Keep connected</Button>
              </>
            ) : (
              <Button color="error" onClick={() => setConfirming(true)}>
                Disconnect Google Drive
              </Button>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  )
}
