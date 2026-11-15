import { useState } from 'react'
import { EnvBadge } from '../components/EnvBadge'
import { ParamForm } from '../components/ParamForm'
import { PreflightPanel, type PanelCheck } from '../components/PreflightPanel'
import { ConfirmRecap } from '../components/ConfirmRecap'
import { TargetBar } from '../components/TargetBar'
import { targetLabel } from '../components/target'
import { ResultsGrid } from '../components/ResultsGrid'
import { StatementList } from '../components/StatementList'
import { StepLog } from '../components/StepLog'
import type { LookupResult } from '../api/lookups'
import { useServers } from '../api/servers'
import {
  useExecuteWorkflow,
  usePreviewWorkflow,
  useWorkflows,
  type WorkflowStepResult,
  type WorkflowSummary,
} from '../api/workflows'

const WORKFLOW_ID = 'offboarding.full'

/**
 * Guided offboarding: pick a server and a login, tick the steps, preview the SQL of all of them,
 * confirm once, and watch each step's status. A failed step stops the rest so the cause can be
 * fixed and the remaining steps run again (steps already done are simply left unticked).
 */
export default function OffboardingPage() {
  const servers = useServers()
  const workflows = useWorkflows()
  const workflow = workflows.data?.find((w) => w.id === WORKFLOW_ID)

  const [serverName, setServerName] = useState<string | null>(null)
  const [paramValues, setParamValues] = useState<Record<string, string>>({})
  // null = "untouched": show the workflow's default selection.
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const [typedServerName, setTypedServerName] = useState('')
  // Why a required field cannot be filled in right now: keeps Preview / Run off and says why.
  const [cannotFill, setCannotFill] = useState<string[]>([])

  const preview = usePreviewWorkflow(WORKFLOW_ID)
  const execute = useExecuteWorkflow(WORKFLOW_ID)

  const server = servers.data?.find((s) => s.name === serverName)
  const selected = picked ?? defaultSelection(workflow)
  const pendingConfirm = preview.data?.destructive ? preview.data : null
  const confirmReady = !pendingConfirm?.requiresServerName || typedServerName === serverName
  // Preflight checks of every selected step: one blocking failure stops the whole checklist, before the snapshot.
  const checks: PanelCheck[] | undefined = preview.data?.checks.map((c) => ({ ...c.result, stepTitle: c.stepTitle }))
  const blocked = checks?.some((c) => c.blocking) ?? false

  // Target context (F4): who is being offboarded, from where, repeated in the bar, the button and the recap.
  const leaver = paramValues['login_name']
  const newOwner = paramValues['new_owner']
  const summary = leaver
    ? `Offboard [${leaver}] · ${selected.size} step${selected.size === 1 ? '' : 's'}${newOwner ? ` · new owner [${newOwner}]` : ''}`
    : 'Offboard a login'

  function buildRequest() {
    return {
      serverName: serverName!,
      params: paramValues,
      steps: [...selected],
      confirmToken: null,
      confirmServerName: null,
    }
  }

  /** The token is bound to the exact request, so any edit throws the preview (and last result) away. */
  function resetPreview() {
    preview.reset()
    execute.reset()
    setTypedServerName('')
  }

  function toggle(key: string) {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setPicked(next)
    resetPreview()
  }

  async function runExecute() {
    if (!serverName || !workflow) return
    // Always preview first: it says whether the plan is destructive and hands back the token.
    const current = preview.data ?? (await preview.mutateAsync(buildRequest()).catch(() => null))
    if (!current) return // preview failed; its error is shown below
    if (current.checks.some((c) => c.result.blocking)) return // blocked by a preflight check; shown below
    if (current.destructive && !(preview.data && confirmReady)) return // show the confirm panel first
    execute.mutate({
      ...buildRequest(),
      confirmToken: current.confirmToken,
      confirmServerName: current.requiresServerName ? typedServerName : null,
    })
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Offboarding</h2>

      <TargetBar server={server} where="server level + every online database" summary={summary} />

      {(servers.isPending || workflows.isPending) && <p className="text-slate-500">Loading…</p>}
      {servers.isError && <p className="text-red-700">Could not load servers: {servers.error.message}</p>}
      {workflows.isError && <p className="text-red-700">Could not load the checklist: {workflows.error.message}</p>}

      {servers.data && workflow && (
        <>
          <p className="max-w-3xl text-sm text-slate-600">{workflow.description}</p>

          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Server</span>
              <select
                value={serverName ?? ''}
                onChange={(e) => {
                  setServerName(e.target.value || null)
                  setParamValues({})
                  resetPreview()
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

          {serverName && (
            <div className="space-y-4 rounded border border-slate-200 p-4">
              <ParamForm
                params={workflow.params}
                values={paramValues}
                onChange={(values) => {
                  setParamValues(values)
                  resetPreview()
                }}
                serverName={serverName}
                database=""
                onBlockedChange={setCannotFill}
              />

              <Checklist workflow={workflow} selected={selected} onToggle={toggle} result={execute.data?.steps} />

              {workflow.notes.length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500">
                  {workflow.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => preview.mutate(buildRequest())}
                  disabled={preview.isPending || cannotFill.length > 0}
                  className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {preview.isPending ? 'Rendering…' : 'Preview all steps'}
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
                    : targetLabel(pendingConfirm ? 'Confirm and run the checklist' : 'Run the checklist', server, leaver ? `[${leaver}]` : null)}
                </button>
                {execute.isError && <span className="text-sm text-red-700">{execute.error.message}</span>}
                {execute.data && <span className="text-sm text-slate-500">{execute.data.elapsedMs} ms</span>}
              </div>

              {cannotFill.length > 0 && <p className="text-sm text-amber-700">Cannot run yet: {cannotFill[0]}</p>}
              {preview.isError && <p className="text-sm text-red-700">{preview.error.message}</p>}

              <PreflightPanel checks={checks} />
              {preview.data?.impact && <ImpactReport impact={preview.data.impact} />}

              {preview.data && (
                <div className="space-y-2">
                  {preview.data.steps.map((s, i) => (
                    <details key={s.key} className="rounded border border-slate-200 text-sm">
                      <summary className="cursor-pointer px-3 py-2 font-medium text-slate-700">
                        {i + 1}. {s.title}
                        {s.destructive && <span className="ml-2 text-xs text-red-700">⚠ destructive</span>}
                      </summary>
                      <div className="space-y-2 border-t border-slate-100 p-3">
                        {/* Dry run: the exact statements. Steps without dry-run (the snapshot) show their query. */}
                        {s.statements ? (
                          <StatementList statements={s.statements} />
                        ) : (
                          <pre className="whitespace-pre-wrap bg-slate-50 p-3 text-xs text-slate-700">
                            {s.batches.join('\nGO\n')}
                          </pre>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              )}

              {pendingConfirm && !blocked && (
                <div className="space-y-2 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
                  <p className="font-medium">
                    ⚠ This runs {pendingConfirm.steps.length} steps and changes the server. Review the statements above, then confirm.
                  </p>
                  {server && (
                    <ConfirmRecap
                      rows={[
                        ['Server', `${server.name} (${server.environment})`],
                        ['Login', leaver ? `[${leaver}]` : null],
                        ['New owner', newOwner ? `[${newOwner}]` : null],
                        ['Steps', pendingConfirm.steps.map((s) => s.title).join(' → ')],
                        ['Statements', `${pendingConfirm.steps.reduce((n, s) => n + (s.statements?.length ?? 0), 0)} in total`],
                        ['Will touch', touchedSummary(preview.data?.impact)],
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

              {execute.data && <Results steps={execute.data.steps} warnings={execute.data.warnings} success={execute.data.success} />}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** "1 databases owned, 2 server roles" — the non-zero lines of the impact report, for the confirm recap. */
function touchedSummary(impact: LookupResult | null | undefined): string | null {
  if (!impact || impact.warning) return null
  const lines = impact.items
    .map((i) => ({ label: i.label.replace(/ \(.*\)$/, '').toLowerCase(), count: Number((i.extra as Record<string, unknown>).count ?? 0) }))
    .filter((i) => i.count > 0 && !i.label.startsWith('databases not online'))
    .map((i) => `${i.count} ${i.label}`)
  return lines.length > 0 ? lines.join(', ') : 'nothing owned or held by this login'
}

/** Dry-run report: how many sessions / jobs / databases / roles the run will touch, from the server. */
function ImpactReport({ impact }: { impact: LookupResult }) {
  if (impact.warning) {
    return <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">⚠ {impact.warning}</p>
  }

  return (
    <div className="rounded border border-slate-200 text-sm">
      <p className="border-b border-slate-100 px-3 py-2 font-medium text-slate-700">What this run will touch</p>
      <table className="w-full">
        <tbody>
          {impact.items.map((item) => {
            const count = Number((item.extra as Record<string, unknown>).count ?? 0)
            return (
              <tr key={item.value} className="border-t border-slate-100 first:border-t-0">
                <td className="px-3 py-1 text-slate-600">{item.label}</td>
                <td className={`px-3 py-1 text-right tabular-nums ${count > 0 ? 'font-medium text-slate-900' : 'text-slate-400'}`}>
                  {count}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function defaultSelection(workflow: WorkflowSummary | undefined): Set<string> {
  return new Set(workflow?.steps.filter((s) => s.required || s.defaultOn).map((s) => s.key))
}

/** The ticks. After a run each row also shows its outcome, so the list doubles as progress. */
function Checklist({
  workflow,
  selected,
  onToggle,
  result,
}: {
  workflow: WorkflowSummary
  selected: Set<string>
  onToggle: (key: string) => void
  result: readonly WorkflowStepResult[] | undefined
}) {
  return (
    <ol className="space-y-1">
      {workflow.steps.map((s, i) => {
        const outcome = result?.find((r) => r.key === s.key)
        return (
          <li key={s.key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              id={`step-${s.key}`}
              checked={selected.has(s.key)}
              disabled={s.required}
              onChange={() => onToggle(s.key)}
            />
            <label htmlFor={`step-${s.key}`} className={selected.has(s.key) ? '' : 'text-slate-400'}>
              {i + 1}. {s.title}
              {s.destructive && <span className="ml-2 text-xs text-red-700">⚠</span>}
              {s.needsNewOwner && <span className="ml-2 text-xs text-slate-500">(needs an owner — see "New owner" above)</span>}
              {s.required && <span className="ml-2 text-xs text-slate-500">(always)</span>}
            </label>
            {outcome && <StatusBadge status={outcome.status} />}
          </li>
        )
      })}
    </ol>
  )
}

function StatusBadge({ status }: { status: string }) {
  const style =
    status === 'OK'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-300'
      : status === 'FAILED'
        ? 'bg-red-50 text-red-700 ring-red-300'
        : 'bg-slate-100 text-slate-500 ring-slate-300'
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${style}`}>{status === 'NOT_RUN' ? 'not run' : status}</span>
}

/** Per-step detail after a run: error, snapshot file, per-database log and result grids. */
function Results({
  steps,
  warnings,
  success,
}: {
  steps: readonly WorkflowStepResult[]
  warnings: readonly string[]
  success: boolean
}) {
  return (
    <div className="space-y-3">
      <p className={`text-sm font-medium ${success ? 'text-emerald-700' : 'text-red-700'}`}>
        {success ? 'All steps finished.' : 'Stopped at the first failed step; later steps did not run.'}
      </p>

      {warnings.map((w) => (
        <p key={w} className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠ {w}
        </p>
      ))}

      {steps
        .filter((s) => s.status !== 'NOT_RUN')
        .map((s) => (
          <details key={s.key} open={s.status === 'FAILED'} className="rounded border border-slate-200 text-sm">
            <summary className="cursor-pointer px-3 py-2 font-medium text-slate-700">
              {s.title} <StatusBadge status={s.status} /> <span className="font-normal text-slate-400">{s.elapsedMs} ms</span>
            </summary>
            <div className="space-y-3 border-t border-slate-100 p-3">
              {s.snapshotPath && (
                <p className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-900">
                  Snapshot saved: <code className="break-all">{s.snapshotPath}</code>
                </p>
              )}
              {s.steps && <StepLog steps={[...s.steps]} />}
              <ResultsGrid
                result={{ success: s.status === 'OK', resultSets: s.resultSets, messages: s.messages, error: s.error }}
                exportName={`offboarding ${s.key}`}
              />
            </div>
          </details>
        ))}
    </div>
  )
}
