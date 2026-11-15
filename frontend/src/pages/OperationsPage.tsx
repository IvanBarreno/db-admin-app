import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { readOperationLink } from '../components/useInOperation'
import { AccessComparison } from '../components/AccessComparison'
import { EnvBadge } from '../components/EnvBadge'
import { ParamForm } from '../components/ParamForm'
import { PreflightPanel } from '../components/PreflightPanel'
import { ConfirmRecap } from '../components/ConfirmRecap'
import { TargetBar } from '../components/TargetBar'
import { describeOperation, principalsOf, scopeLabel, targetLabel } from '../components/target'
import { ResultsGrid } from '../components/ResultsGrid'
import { StatementList } from '../components/StatementList'
import { GeneratedPasswords } from '../components/GeneratedPasswords'
import { StepLog } from '../components/StepLog'
import { useDatabases, useServers } from '../api/servers'
import { useExecuteOperation, useOperations, usePreviewOperation } from '../api/operations'

/** "3 statements in 2 databases" from a dry run; null when the operation has no dry run. */
function statementSummary(statements: readonly { database?: string | null }[] | null | undefined): string | null {
  if (!statements) return null
  const databases = new Set(statements.map((s) => s.database).filter(Boolean))
  const count = `${statements.length} statement${statements.length === 1 ? '' : 's'}`
  return databases.size > 0 ? `${count} in ${databases.size} database${databases.size === 1 ? '' : 's'}` : count
}

/** Operation catalog: pick a server, pick an operation, fill its params, preview or run it. */
export default function OperationsPage() {
  const servers = useServers()
  // Arriving from the Explorer's "Use in operation" (/operations?server=…&operation=…&p.login_name=…): start
  // with that server, operation and value. Read ONCE, as the initial state; a plain /operations starts blank.
  const [searchParams] = useSearchParams()
  const [start] = useState(() => readOperationLink(searchParams))
  const [serverName, setServerName] = useState<string | null>(start.serverName)
  const [database, setDatabase] = useState<string>(start.database)
  const [operationId, setOperationId] = useState<string | null>(start.operationId)
  const [paramValues, setParamValues] = useState<Record<string, string>>(start.params)
  // Why a required field cannot be filled in right now (empty list on the server, no permission...): keeps Preview / Execute off.
  const [formBlocked, setFormBlocked] = useState<string[]>([])

  const databases = useDatabases(serverName)
  const operations = useOperations(serverName)
  const operation = operations.data?.find((o) => o.id === operationId)

  const preview = usePreviewOperation(operationId ?? '')
  const execute = useExecuteOperation(operationId ?? '')

  const server = servers.data?.find((s) => s.name === serverName)

  // Only database-scope operations work inside ONE database, so only they get (and send) a database.
  // Server-scope ops ignore it; all-databases ops pick theirs in their own checklist.
  const needsDatabase = operation?.scope === 'Database'
  const effectiveDatabase = needsDatabase ? database : ''
  // Reasons the buttons stay off: a required field cannot be filled, or a database-level run has no database
  // (a server with a default database, such as an Azure SQL Database, may leave it blank).
  const missingDatabase = needsDatabase && !database && !server?.defaultDatabase
  const cannotFill = missingDatabase ? ['Select the database this operation works in.', ...formBlocked] : formBlocked

  // Target context (F4): where the change lands and what it is, repeated in the bar, the button and the recap.
  const where = server ? scopeLabel(operation?.scope ?? null, effectiveDatabase, server) : null
  const summary = operation ? describeOperation(operation, paramValues) : null

  // Destructive operations: the preview hands back a token bound to the exact request, and
  // Production servers also need the server name typed. Both go back with /execute.
  const [typedServerName, setTypedServerName] = useState('')
  const pendingConfirm = preview.data?.destructive ? preview.data : null
  const confirmReady = !pendingConfirm?.requiresServerName || typedServerName === serverName
  // A failed blocking preflight check stops the run (no token is issued, and execute would answer 409).
  const blocked = preview.data?.checks?.some((c) => c.blocking) ?? false

  function buildRequest() {
    return {
      serverName: serverName!,
      database: effectiveDatabase || null,
      params: paramValues,
      confirmToken: null,
      confirmServerName: null,
    }
  }

  /**
   * The token only fits the request it was issued for, so any edit throws the preview away. The previous RUN's
   * result goes too: a grid that belongs to other values would be read as the answer to the new ones.
   */
  function resetPreview() {
    preview.reset()
    execute.reset()
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
    if (current.checks?.some((c) => c.blocking)) return // blocked by a preflight check; shown below
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

      <TargetBar server={server} where={operation ? where : null} summary={summary} />

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
                <option key={op.id} value={op.id} title={op.description ?? undefined}>
                  [{op.category}] {op.name}
                  {op.destructive ? ' ⚠' : ''}
                </option>
              ))}
            </select>
          )}
          {/* What the chosen operation does, in plain words (the option tooltips are not shown everywhere). */}
          {operation?.description && <span className="mt-1 block max-w-2xl text-xs text-slate-500">{operation.description}</span>}
        </label>
      )}

      {operation && (
        <div className="space-y-3 rounded border border-slate-200 p-4">
          {/* Only here, and only for operations that work inside one database: the user / role lists below need it. */}
          {needsDatabase && (
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">
                Database <span className="text-red-600">*</span>
                <span className="ml-2 text-xs text-slate-400">this operation works inside one database</span>
              </span>
              <select
                value={database}
                onChange={(e) => {
                  setDatabase(e.target.value)
                  changeParams({}) // users and roles belong to the database: start the form again
                }}
                disabled={databases.isPending}
                className="rounded border border-slate-300 px-2 py-1.5 disabled:opacity-50"
              >
                <option value="">{databases.isPending ? 'loading…' : `Select a database… (blank = ${server?.defaultDatabase ?? 'login default'})`}</option>
                {databases.data?.map((d) => (
                  <option key={d.name} value={d.name} disabled={!d.isOnline}>
                    {d.name}
                    {d.isOnline ? '' : ` (${d.state.toLowerCase()})`}
                  </option>
                ))}
              </select>
            </label>
          )}

          <ParamForm
            params={operation.params}
            values={paramValues}
            onChange={changeParams}
            serverName={serverName}
            database={effectiveDatabase}
            allowProtected={operation.readOnly}
            onBlockedChange={setFormBlocked}
          />

          {/* Clone: both logins' current access side by side, with what the target will hold afterwards. */}
          {operation.id === 'changes.clone_server_access' && (
            <AccessComparison
              serverName={serverName}
              source={paramValues.source_login ?? ''}
              target={paramValues.target_login ?? ''}
              includeRoles={paramValues.include_roles !== 'false'}
              includePermissions={paramValues.include_permissions !== 'false'}
            />
          )}
          {operation.id === 'changes.clone_database_access' && (
            <AccessComparison
              serverName={serverName}
              source={paramValues.source_user ?? ''}
              target={paramValues.target_user ?? ''}
              includeRoles={paramValues.include_roles !== 'false'}
              includePermissions={paramValues.include_permissions !== 'false'}
              lookupId="database_access"
              argName="user_name"
              database={effectiveDatabase}
            />
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={runPreview}
              disabled={preview.isPending || cannotFill.length > 0}
              className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {preview.isPending ? 'Rendering…' : 'Preview'}
            </button>
            <button
              type="button"
              onClick={runExecute}
              disabled={execute.isPending || preview.isPending || !confirmReady || blocked || cannotFill.length > 0}
              className={`rounded px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                pendingConfirm ? 'bg-red-700 hover:bg-red-600' : 'bg-slate-800 hover:bg-slate-700'
              }`}
            >
              {execute.isPending
                ? 'Running…'
                : targetLabel(pendingConfirm ? 'Confirm and execute' : 'Execute', server, where)}
            </button>
            {execute.isError && <span className="text-sm text-red-700">{execute.error.message}</span>}
            {execute.data && <span className="text-sm text-slate-500">{execute.data.elapsedMs} ms</span>}
          </div>
          {cannotFill.length > 0 && <p className="text-sm text-amber-700">Cannot run yet: {cannotFill[0]}</p>}

          {preview.isError && <p className="text-sm text-red-700">{preview.error.message}</p>}
          {/* Dry run: the real final statements. The template (with @placeholders) stays one click away. */}
          <StatementList statements={preview.data?.statements} />
          {/* Plain operations (no dry run): the same SQL with the values written in, for reading only. */}
          {preview.data?.resolvedBatches && (
            <div className="overflow-hidden rounded border border-slate-200 text-xs">
              <p className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 font-medium text-slate-600">
                SQL with your values{' '}
                <span className="font-normal text-slate-500">
                  (for reading: the run sends the template below and passes the values as parameters)
                </span>
              </p>
              <pre className="whitespace-pre-wrap p-3 font-mono text-slate-800">{preview.data.resolvedBatches.join('\nGO\n')}</pre>
            </div>
          )}
          {preview.data && (
            <details open={!preview.data.statements && !preview.data.resolvedBatches} className="text-xs">
              <summary className="cursor-pointer text-slate-500">Template SQL</summary>
              <pre className="mt-1 whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-3 text-slate-700">
                {preview.data.batches.join('\nGO\n')}
              </pre>
            </details>
          )}

          <PreflightPanel checks={preview.data?.checks} />

          {pendingConfirm && !blocked && (
            <div className="space-y-2 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
              <p className="font-medium">⚠ Destructive operation. Review the statements above, then confirm.</p>
              {server && operation && (
                <ConfirmRecap
                  rows={[
                    ['Server', `${server.name} (${server.environment})`],
                    ['Where', where],
                    ['Operation', operation.name],
                    ['Acts on', principalsOf(operation, paramValues).join(', ')],
                    ['Statements', statementSummary(pendingConfirm.statements)],
                  ]}
                />
              )}
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
          {execute.data && <ResultsGrid result={execute.data} exportName={`${serverName} ${operationId}`} />}
        </div>
      )}
    </div>
  )
}
