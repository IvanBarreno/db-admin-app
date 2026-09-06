import { usePing } from './api/ping'

/**
 * Phase 0 App: a header with a live "API status" badge.
 * Pages, routing and the real layout arrive in Phase 1; this only proves the chain
 * React → TanStack Query → Vite proxy → Kestrel → C# handler → JSON → React.
 */
export default function App() {
  const ping = usePing()

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <h1 className="text-lg font-semibold">SQL Admin Console</h1>
        <ApiStatus
          state={ping.isPending ? 'checking' : ping.isError ? 'down' : 'up'}
          detail={ping.data ? `${ping.data.environment} · v${ping.data.version}` : ping.error?.message}
        />
      </header>

      <main className="mx-auto max-w-5xl p-6">
        <p className="text-slate-600">
          Phase 0 skeleton. If the badge above is green, the frontend is talking to the .NET API.
        </p>
      </main>
    </div>
  )
}

/** Small coloured pill: green when the API answers, red when it doesn't, grey while checking. */
function ApiStatus({ state, detail }: { state: 'checking' | 'up' | 'down'; detail?: string }) {
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
