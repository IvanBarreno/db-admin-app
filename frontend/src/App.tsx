import { Text } from '@mantine/core'
import { Route, Routes } from 'react-router'
import ServersPage from './pages/ServersPage'
import CustomSqlPage from './pages/CustomSqlPage'
import ExplorerPage from './pages/ExplorerPage'
import OperationsPage from './pages/OperationsPage'
import OffboardingPage from './pages/OffboardingPage'
import AuditLogPage from './pages/AuditLogPage'
import DocsPage from './pages/DocsPage'
import { AppLayout } from './shell/AppLayout'

/**
 * The application: the shell (header + sidebar, see shell/AppLayout.tsx) around the page for the current
 * URL. The list of pages shown in the sidebar lives in AppLayout; the URL → page mapping lives here.
 */
export default function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<ServersPage />} />
        <Route path="/explorer" element={<ExplorerPage />} />
        <Route path="/operations" element={<OperationsPage />} />
        <Route path="/offboarding" element={<OffboardingPage />} />
        <Route path="/sql" element={<CustomSqlPage />} />
        <Route path="/audit" element={<AuditLogPage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="*" element={<Text c="dimmed">Page not found.</Text>} />
      </Routes>
    </AppLayout>
  )
}
