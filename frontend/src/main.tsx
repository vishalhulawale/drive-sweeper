import '@cloudscape-design/global-styles/index-base.css'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './index.css'
import { colorBackgroundLayoutMain, colorTextBodyDefault } from '@cloudscape-design/design-tokens'
import { keepPreviousData, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
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
  // keepPreviousData: when a query's key changes (page, sort, filter) the old rows stay visible until the new ones arrive.
  defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 5000, placeholderData: keepPreviousData } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
