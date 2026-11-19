import { createTheme, ThemeProvider } from '@mui/material/styles'
import { useMemo, type ReactNode } from 'react'
import { usePreferences } from './preferences'
import { FONT_SANS } from './theme'

/** Pages not yet moved to Cloudscape still use MUI; keep its mode and font in step with the app. Removed in phase 5. */
export default function LegacyMuiTheme({ children }: { children: ReactNode }) {
  const { mode } = usePreferences()
  const theme = useMemo(
    () => createTheme({ palette: { mode }, typography: { fontFamily: FONT_SANS } }),
    [mode],
  )
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>
}
