import { useState } from 'react'
import { useAuditLog, useAuditSteps, type AuditEntry } from '../api/audit'
import { useServers } from '../api/servers'
import { StepLog } from '../components/StepLog'

/** One log row; the "Steps" button lazily loads the per-database log of that run. */
function AuditRow({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false)
  const steps = useAuditSteps(entry.id, open)

  return (
    <>
      <tr className="border-b border-slate-100 align-top">
        <td className="py-2 pr-4 whitespace-nowrap text-slate-500">
          {new Date(entry.executedAtUtc).toLocaleString()}
        </td>
        <td className="py-2 pr-4">{entry.executedBy}</td>
        <td className="py-2 pr-4">{entry.serverName}</td>
        <td className="py-2 pr-4">{entry.database ?? '—'}</td>
        <td className="py-2 pr-4">
          <span className={entry.status === 'Success' ? 'text-emerald-700' : 'text-red-700'}>{entry.status}</span>
          {entry.detail && <div className="text-xs text-slate-500">{entry.detail}</div>}
        </td>
        <td className="max-w-md truncate py-2 pr-4 font-mono text-xs" title={entry.sql}>
          {entry.sql}
        </td>
        <td className="py-2">
          <button type="button" onClick={() => setOpen(!open)} className="text-xs text-slate-600 underline">
            {open ? 'Hide steps' : 'Steps'}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-slate-100">
          <td colSpan={7} className="pb-3">
            {steps.isPending && <p className="text-xs text-slate-500">Loading…</p>}
            {steps.data?.length === 0 && <p className="text-xs text-slate-500">No steps recorded for this entry.</p>}
            {steps.data && <StepLog steps={steps.data} />}
          </td>
        </tr>
      )}
    </>
  )
}

/** Audit Log page: filters by user, server, status, newest entries first. */
export default function AuditLogPage() {
  const servers = useServers()
  const [executedBy, setExecutedBy] = useState('')
  const [serverName, setServerName] = useState('')
  const [status, setStatus] = useState('')

  const audit = useAuditLog({
    executedBy: executedBy || undefined,
    serverName: serverName || undefined,
    status: status || undefined,
  })

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Audit log</h2>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">User</span>
          <input
            value={executedBy}
            onChange={(e) => setExecutedBy(e.target.value)}
            placeholder="any"
            className="rounded border border-slate-300 px-2 py-1.5"
          />
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Server</span>
          <select
            value={serverName}
            onChange={(e) => setServerName(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5"
          >
            <option value="">any</option>
            {servers.data?.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5"
          >
            <option value="">any</option>
            <option value="Success">Success</option>
            <option value="Failed">Failed</option>
          </select>
        </label>
      </div>

      {audit.isPending && <p className="text-slate-500">Loading…</p>}
      {audit.isError && <p className="text-red-700">Could not load audit log: {audit.error.message}</p>}

      {audit.data && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-600">
              <th className="py-2 pr-4">When</th>
              <th className="py-2 pr-4">User</th>
              <th className="py-2 pr-4">Server</th>
              <th className="py-2 pr-4">Database</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">SQL</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {audit.data.map((entry) => (
              <AuditRow key={entry.id} entry={entry} />
            ))}
            {audit.data.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-center text-slate-500">
                  No entries match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}
