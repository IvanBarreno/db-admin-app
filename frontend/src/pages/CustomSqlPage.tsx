import { useState } from 'react'
import { EnvBadge } from '../components/EnvBadge'
import { ResultsGrid } from '../components/ResultsGrid'
import { useDatabases, useServers } from '../api/servers'
import { useRunCustomSql } from '../api/customSql'

/** Free-form SQL box: server + optional database picker, a text area, and Execute. */
export default function CustomSqlPage() {
  const servers = useServers()
  const [serverName, setServerName] = useState<string | null>(null)
  const [database, setDatabase] = useState<string>('')
  const [sql, setSql] = useState('')

  const databases = useDatabases(serverName)
  const run = useRunCustomSql()

  const server = servers.data?.find((s) => s.name === serverName)

  function execute() {
    if (!serverName || sql.trim() === '') return
    run.mutate({ serverName, database: database || null, sql })
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Custom SQL</h2>

      {servers.isPending && <p className="text-slate-500">Loading servers…</p>}
      {servers.isError && <p className="text-red-700">Could not load servers: {servers.error.message}</p>}

      {servers.data && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Server</span>
            <select
              value={serverName ?? ''}
              onChange={(e) => {
                setServerName(e.target.value || null)
                setDatabase('')
              }}
              className="rounded border border-slate-300 px-2 py-1.5"
            >
              <option value="">Select a server…</option>
              {servers.data.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Database</span>
            <select
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
              disabled={!serverName || databases.isPending}
              className="rounded border border-slate-300 px-2 py-1.5 disabled:opacity-50"
            >
              <option value="">{server?.defaultDatabase ?? '(login default)'}</option>
              {databases.data?.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>

          {server && <EnvBadge environment={server.environment} />}
        </div>
      )}

      <textarea
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        placeholder="SELECT ..."
        rows={12}
        spellCheck={false}
        className="w-full rounded border border-slate-300 p-3 font-mono text-sm"
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={execute}
          disabled={!serverName || sql.trim() === '' || run.isPending}
          className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {run.isPending ? 'Running…' : 'Execute'}
        </button>
        {run.isError && <span className="text-sm text-red-700">{run.error.message}</span>}
        {run.data && (
          <span className="text-sm text-slate-500">
            {run.data.elapsedMs} ms
          </span>
        )}
      </div>

      {run.data && <ResultsGrid result={run.data} />}
    </div>
  )
}
