import { useState } from 'react'
import { EnvBadge } from '../components/EnvBadge'
import { ParamForm } from '../components/ParamForm'
import { ProductionBanner } from '../components/ProductionBanner'
import { ResultsGrid } from '../components/ResultsGrid'
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

  function buildRequest() {
    return { serverName: serverName!, database: database || null, params: paramValues }
  }

  function runPreview() {
    if (!serverName || !operationId) return
    preview.mutate(buildRequest())
  }

  function runExecute() {
    if (!serverName || !operationId) return
    execute.mutate(buildRequest())
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
                setParamValues({})
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
                setParamValues({})
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
          <ParamForm params={operation.params} values={paramValues} onChange={setParamValues} />

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
              disabled={execute.isPending}
              className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {execute.isPending ? 'Running…' : 'Execute'}
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

          {execute.data && <ResultsGrid result={execute.data} />}
        </div>
      )}
    </div>
  )
}
