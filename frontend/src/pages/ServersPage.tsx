import { EnvBadge } from '../components/EnvBadge'
import { useServers, useTestConnection, type ServerSummary } from '../api/servers'

/** Lists every configured server with a "Test connection" button per card. */
export default function ServersPage() {
  const servers = useServers()

  if (servers.isPending) return <p className="text-slate-500">Loading servers…</p>
  if (servers.isError) return <p className="text-red-700">Could not load servers: {servers.error.message}</p>

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Servers</h2>
      <p className="text-sm text-slate-600">
        Defined in <code>servers.json</code> (shared) and <code>servers.local.json</code> (personal). Restart the API after editing.
      </p>
      <ul className="grid gap-4 md:grid-cols-2">
        {servers.data.map((s) => (
          <li key={s.name}>
            <ServerCard server={s} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function ServerCard({ server }: { server: ServerSummary }) {
  const test = useTestConnection(server.name)

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{server.name}</h3>
          <p className="text-sm text-slate-600">
            {server.host}
            {server.port ? `,${server.port}` : ''}
            {server.defaultDatabase ? ` · ${server.defaultDatabase}` : ''}
          </p>
        </div>
        <EnvBadge environment={server.environment} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-slate-500">Engine</dt>
        <dd>{server.engineDisplayName}</dd>
        <dt className="text-slate-500">Auth</dt>
        <dd>{server.auth}</dd>
        {server.tags.length > 0 && (
          <>
            <dt className="text-slate-500">Tags</dt>
            <dd>{server.tags.join(', ')}</dd>
          </>
        )}
      </dl>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => test.mutate()}
          disabled={test.isPending}
          className="rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {test.isPending ? 'Testing…' : 'Test connection'}
        </button>
        {test.isError && <span className="text-sm text-red-700">{test.error.message}</span>}
      </div>

      {test.data && <TestResult result={test.data} />}
    </div>
  )
}

function TestResult({ result }: { result: NonNullable<ReturnType<typeof useTestConnection>['data']> }) {
  if (!result.success || !result.info) {
    return (
      <div className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <p className="font-medium">Connection failed ({result.elapsedMs} ms)</p>
        <p className="mt-1 whitespace-pre-wrap break-words">{result.error}</p>
      </div>
    )
  }

  const i = result.info
  return (
    <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
      <p className="font-medium">Connected in {result.elapsedMs} ms</p>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-emerald-700">Server</dt>
        <dd>{i.serverName}</dd>
        <dt className="text-emerald-700">Version</dt>
        <dd>
          {i.version} · {i.edition}
        </dd>
        <dt className="text-emerald-700">Login</dt>
        <dd>
          {i.loginName}
          {i.isSysAdmin ? ' (sysadmin)' : ''}
        </dd>
        <dt className="text-emerald-700">Database</dt>
        <dd>{i.currentDatabase}</dd>
      </dl>
    </div>
  )
}
