import type { Schema } from '../api/client'

export type DryRunStatement = Schema<'DryRunStatement'>

/**
 * The exact statements a run will execute (dry run), one block per database for all-databases
 * operations. This is what the DBA confirms — not the template with `@login_name` placeholders.
 */
export function StatementList({ statements }: { statements: readonly DryRunStatement[] | null | undefined }) {
  if (!statements) return null
  if (statements.length === 0) {
    return <p className="text-sm text-slate-500">Nothing to execute: the script found nothing to change.</p>
  }

  return (
    <div className="overflow-hidden rounded border border-slate-200 text-xs">
      <p className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 font-medium text-slate-600">
        Statements that will run ({statements.length})
      </p>
      <table className="w-full">
        <tbody>
          {statements.map((s, i) => (
            <tr key={i} className="border-t border-slate-100 align-top first:border-t-0">
              {s.database !== undefined && s.database !== null && (
                <td className="whitespace-nowrap px-3 py-1.5 font-medium text-slate-500">{s.database}</td>
              )}
              <td className="px-3 py-1.5">
                <pre className="whitespace-pre-wrap font-mono text-slate-800">{s.text}</pre>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
