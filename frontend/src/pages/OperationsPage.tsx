import { useState } from 'react'
import { EnvBadge } from '../components/EnvBadge'
import { ParamForm } from '../components/ParamForm'
import { ProductionBanner } from '../components/ProductionBanner'
import { ResultsGrid } from '../components/ResultsGrid'
import { GeneratedPasswords } from '../components/GeneratedPasswords'
import { StepLog } from '../components/StepLog'
import { useDatabases, useServers } from '../api/servers'
import { useExecuteOperation, useOperations, usePreviewOperation } from '../api/operations'

/** Operation catalog: pick a server, pick an operation, fill its params, preview or run it. */
export default function OperationsPage() {
  const servers = useServers()
  const [serverName, setServerName] = useState<string | null>(null)
  const [database, setDatabase] = useState<string>('')
  const [operationId, setOperationId] = useState<string | null>(null)
  const [paramValues, setParamValues] = useState<Record<string, string>>({})

  const databases = useDatabases(serverName)
  const operations = useOperations(serverName)
  const operation = operations.data?.find((o) => o.id === operationId)

  const preview = usePreviewOperation(operationId ?? '')
  const execute = useExecuteOperation(operationId ?? '')

  const server = servers.data?.find((s) => s.name === serverName)

  // Destructive operations: the preview hands back a token bound to the exact request, and
  // Production servers also need the server name typed. Both go back with /execute.
  const [typedServerName, setTypedServerName] = useState('')
  const pendingConfirm = preview.data?.destructive ? preview.data : null
  const confirmReady = !pendingConfirm?.requiresServerName || typedServerName === serverName

  function buildRequest() {
    return {
      serverName: serverName!,
      database: database || null,
      params: paramValues,
      confirmToken: null,
      confirmServerName: null,
    }
  }

  /** The token only fits the request it was issued for, so any edit throws the preview away. */
  function resetPreview() {
    preview.reset()
    setTypedServerName('')
  }

  function changeParams(values: Record<string, string>) {
    setParamValues(values)
    resetPreview()
  }

  function runPreview() {
    if (!serverName || !operationId) return
    preview.mutate(buildRequest())
  }

  async function runExecute() {
    if (!serverName || !operationId) return
    // Always preview first: it tells us whether this run is destructive and gives the token.
    const current = preview.data ?? (await preview.mutateAsync(buildRequest()).catch(() => null))
    if (!current) return // preview failed; its error is shown below
    if (current.destructive && !(preview.data && confirmReady)) return // show the confirm panel first
    execute.mutate({
      ...buildRequest(),
      confirmToken: current.confirmToken,
      confirmServerName: current.requiresServerName ? typedServerName : null,
    })
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Operations</h2>

      {server?.environment === 'Production' && <ProductionBanner serverName={server.name} />}

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
                setOperationId(null)
                changeParams({})
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
              onChange={(e) => {
                setDatabase(e.target.value)
                resetPreview()
              }}
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

      {serverName && (
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Operation</span>
          {operations.isPending && <p className="text-slate-500">Loading operations…</p>}
          {operations.isError && <p className="text-red-700">Could not load operations: {operations.error.message}</p>}
          {operations.data && (
            <select
              value={operationId ?? ''}
              onChange={(e) => {
                setOperationId(e.target.value || null)
                changeParams({})
              }}
              className="w-full max-w-md rounded border border-slate-300 px-2 py-1.5"
            >
              <option value="">Select an operation…</option>
              {operations.data.map((op) => (
                <option key={op.id} value={op.id}>
                  [{op.category}] {op.name}
                  {op.destructive ? ' ⚠' : ''}
                </option>
              ))}
            </select>
          )}
        </label>
      )}

      {operation && (
        <div className="space-y-3 rounded border border-slate-200 p-4">
          <ParamForm
            params={operation.params}
            values={paramValues}
            onChange={changeParams}
            serverName={serverName}
            database={database}
          />

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={runPreview}
              disabled={preview.isPending}
              className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {preview.isPending ? 'Rendering…' : 'Preview'}
            </button>
            <button
              type="button"
              onClick={runExecute}
              disabled={execute.isPending || preview.isPending || !confirmReady}
              className={`rounded px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                pendingConfirm ? 'bg-red-700 hover:bg-red-600' : 'bg-slate-800 hover:bg-slate-700'
              }`}
            >
              {execute.isPending ? 'Running…' : pendingConfirm ? 'Confirm and execute' : 'Execute'}
            </button>
            {execute.isError && <span className="text-sm text-red-700">{execute.error.message}</span>}
            {execute.data && <span className="text-sm text-slate-500">{execute.data.elapsedMs} ms</span>}
          </div>

          {preview.isError && <p className="text-sm text-red-700">{preview.error.message}</p>}
          {preview.data && (
            <pre className="whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              {preview.data.batches.join('\nGO\n')}
            </pre>
          )}

          {pendingConfirm && (
            <div className="space-y-2 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
              <p className="font-medium">⚠ Destructive operation. Review the SQL above, then confirm.</p>
              {pendingConfirm.requiresServerName && (
                <label className="block">
                  <span className="mb-1 block">
                    Production server: type <strong>{serverName}</strong> to enable the button.
                  </span>
                  <input
                    value={typedServerName}
                    onChange={(e) => setTypedServerName(e.target.value)}
                    className="rounded border border-red-300 bg-white px-2 py-1.5"
                  />
                </label>
              )}
            </div>
          )}

          {execute.data?.generatedPasswords && <GeneratedPasswords passwords={execute.data.generatedPasswords} />}
          {execute.data?.snapshotPath && (
            <p className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              Snapshot saved: <code className="break-all">{execute.data.snapshotPath}</code>
            </p>
          )}
          {execute.data?.steps && <StepLog steps={execute.data.steps} />}
          {execute.data && <ResultsGrid result={execute.data} />}
        </div>
      )}
    </div>
  )
}
