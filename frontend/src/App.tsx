import { NavLink, Route, Routes } from 'react-router'
import { usePing } from './api/ping'
import ServersPage from './pages/ServersPage'
import CustomSqlPage from './pages/CustomSqlPage'

/**
 * Application shell: header with navigation and the API status badge, then the page
 * for the current URL. Pages are added to <Routes> as the phases progress.
 */
export default function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-8">
            <h1 className="text-lg font-semibold">SQL Admin Console</h1>
            <nav className="flex gap-4 text-sm">
              <NavItem to="/">Servers</NavItem>
              <NavItem to="/sql">Custom SQL</NavItem>
              {/* Phase 1 continues: <NavItem to="/audit">Audit log</NavItem> */}
            </nav>
          </div>
          <ApiStatusBadge />
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-6">
        <Routes>
          <Route path="/" element={<ServersPage />} />
          <Route path="/sql" element={<CustomSqlPage />} />
          <Route path="*" element={<p className="text-slate-500">Page not found.</p>} />
        </Routes>
      </main>
    </div>
  )
}

/** NavLink knows whether its route is active, so we can style the current page. */
function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `rounded px-2 py-1 ${isActive ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-600 hover:text-slate-900'}`
      }
    >
      {children}
    </NavLink>
  )
}

/** Green when the API answers, red when it doesn't, grey while checking. */
function ApiStatusBadge() {
  const ping = usePing()
  const state = ping.isPending ? 'checking' : ping.isError ? 'down' : 'up'
  const detail = ping.data ? `${ping.data.environment} · v${ping.data.version}` : ping.error?.message

  const styles = {
    checking: 'bg-slate-100 text-slate-600 ring-slate-300',
    up: 'bg-emerald-50 text-emerald-700 ring-emerald-300',
    down: 'bg-red-50 text-red-700 ring-red-300',
  }[state]
  const label = { checking: 'Checking API…', up: 'API online', down: 'API offline' }[state]

  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 ${styles}`}>
      <span className="size-2 rounded-full bg-current" />
      {label}
      {detail && <span className="font-normal opacity-70">— {detail}</span>}
    </span>
  )
}
