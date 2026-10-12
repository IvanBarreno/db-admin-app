/** One per-database outcome. Both the execute response and /api/audit/{id}/steps fit this shape. */
export interface StepRow {
  database?: string | null
  status: string
  rowCount?: number | null
  message?: string | null
}

/**
 * Summary line ("47 databases: 45 OK, 2 errors") with the per-database list expandable below.
 * Native <details> keeps it dependency-free and collapsed by default; it opens itself when
 * anything failed so errors are never hidden.
 */
export function StepLog({ steps }: { steps: StepRow[] }) {
  if (steps.length === 0) return null

  const errors = steps.filter((s) => s.status === 'ERROR').length
  const skipped = steps.filter((s) => s.status === 'SKIPPED').length
  const ok = steps.length - errors - skipped

  const parts = [`${ok} OK`]
  if (skipped > 0) parts.push(`${skipped} skipped`)
  if (errors > 0) parts.push(`${errors} ${errors === 1 ? 'error' : 'errors'}`)

  return (
    <details open={errors > 0} className="rounded border border-slate-200 text-sm">
      <summary className="cursor-pointer px-3 py-2 font-medium text-slate-700">
        {steps.length} {steps.length === 1 ? 'database' : 'databases'}: {parts.join(', ')}
      </summary>
      <table className="w-full border-collapse text-xs">
        <tbody>
          {steps.map((s, i) => (
            <tr key={i} className="border-t border-slate-100 align-top">
              <td className="px-3 py-1 font-mono">{s.database ?? '—'}</td>
              <td className={`px-3 py-1 ${s.status === 'ERROR' ? 'text-red-700' : s.status === 'SKIPPED' ? 'text-amber-700' : 'text-emerald-700'}`}>
                {s.status}
              </td>
              <td className="px-3 py-1 text-slate-500">{s.rowCount ?? 0} rows</td>
              <td className="px-3 py-1 text-slate-600">{s.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}
