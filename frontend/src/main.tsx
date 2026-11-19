import '@fontsource-variable/open-sans'
import '@fontsource-variable/source-code-pro'
import './index.css'
import { keepPreviousData, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { initPreferences } from './theme/preferences'

initPreferences()

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
