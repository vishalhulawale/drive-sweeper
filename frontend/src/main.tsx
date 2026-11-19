import '@cloudscape-design/global-styles/index-base.css'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './index.css'
import { colorBackgroundLayoutMain, colorTextBodyDefault } from '@cloudscape-design/design-tokens'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import LegacyMuiTheme from './theme/LegacyMuiTheme'
import { initPreferences } from './theme/preferences'
import { applyAppTheme, FONT_SANS } from './theme/theme'

initPreferences()
applyAppTheme()
Object.assign(document.body.style, {
  background: colorBackgroundLayoutMain,
  color: colorTextBodyDefault,
  fontFamily: FONT_SANS,
})

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 5000 } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LegacyMuiTheme>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </LegacyMuiTheme>
    </QueryClientProvider>
  </StrictMode>,
)
