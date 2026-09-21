import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'

// One QueryClient for the whole app: it owns the cache of every useQuery() result.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't hammer the API on every window focus; explicit refetchInterval per query instead.
      refetchOnWindowFocus: false,
      // One retry is enough for a local API; more just delays the "offline" badge.
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Every component below can now call TanStack Query hooks and use client-side routing.
        BrowserRouter uses real URLs (/audit, /sql); the API's SPA fallback serves index.html for them. */}
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
