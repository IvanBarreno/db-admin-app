import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router'

// Styles. ORDER MATTERS (later files win when two rules are equally specific):
//   1. Mantine core first (required by every other Mantine package),
//   2. then the extra Mantine packages we use,
//   3. then our own small global CSS.
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import './index.css'

import App from './App.tsx'
import { theme } from './theme'

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
    {/* MantineProvider: gives every Mantine component the theme and the colour scheme.
        defaultColorScheme="auto" follows the operating system until the DBA picks one with the switch in
        the header; Mantine remembers that choice in localStorage ("mantine-color-scheme"). */}
    <MantineProvider theme={theme} defaultColorScheme="auto">
      {/* Notifications is NOT a wrapper: it is the single place where toasts are drawn.
          Anywhere in the app: notifications.show({ message: '…' }). Render it exactly once. */}
      <Notifications position="top-right" />
      {/* ModalsProvider lets any code open a dialog with modals.openConfirmModal({...}) without keeping
          "is it open?" state in each page. */}
      <ModalsProvider>
        {/* Every component below can now call TanStack Query hooks and use client-side routing.
            BrowserRouter uses real URLs (/audit, /sql); the API's SPA fallback serves index.html for them. */}
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </ModalsProvider>
    </MantineProvider>
  </StrictMode>,
)
