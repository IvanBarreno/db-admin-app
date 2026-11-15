import { useState } from 'react'
import { downloadCsv, fileSlug, toCsv } from './csv'

/** Shape shared by CustomSqlResult and OperationExecuteResult — anything ResultsGrid can render. */
export interface ScriptRunResult {
  success: boolean
  resultSets: readonly {
    batchIndex: number
    columns: readonly string[]
    rows: readonly (readonly unknown[])[]
  }[]
  messages: readonly string[]
  failedBatchIndex?: number | null
  error?: string | null
}

/**
 * Renders every result set as a tab (batch #N) plus provider messages and the failure, if any.
 * `exportName` names the CSV file of the "Export CSV" button (e.g. the server and operation).
 */
export function ResultsGrid({ result, exportName = 'result' }: { result: ScriptRunResult; exportName?: string }) {
  const [activeTab, setActiveTab] = useState(0)
  const sets = result.resultSets
  // A new result can have fewer grids than the tab that was open: never index past the end.
  const shownIndex = Math.min(activeTab, sets.length - 1)

  function exportCsv() {
    const set = sets[shownIndex]
    // Raw values, not the on-screen text: NULL becomes an empty field, dates keep their full precision.
    const suffix = sets.length > 1 ? `-${shownIndex + 1}` : ''
    downloadCsv(`${fileSlug(exportName)}${suffix}`, toCsv(set.columns, set.rows))
  }

  return (
    <div className="space-y-3">
      {result.messages.length > 0 && (
        <pre className="whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          {result.messages.join('\n')}
        </pre>
      )}

      {!result.success && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">
            Batch {(result.failedBatchIndex ?? 0) + 1} failed
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words">{result.error}</p>
        </div>
      )}

      {sets.length > 0 && (
        <div>
          {sets.length > 1 && (
            <div className="mb-2 flex gap-1 border-b border-slate-200">
              {sets.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveTab(i)}
                  className={`rounded-t px-3 py-1.5 text-sm font-medium ${
                    activeTab === i
                      ? 'border-b-2 border-slate-800 text-slate-900'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Result {i + 1} (batch {s.batchIndex + 1}) · {s.rows.length} row{s.rows.length === 1 ? '' : 's'}
                </button>
              ))}
            </div>
          )}
          <div className="mb-1 flex items-center gap-3 text-xs text-slate-500">
            <span>
              {sets[shownIndex].rows.length} row{sets[shownIndex].rows.length === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              onClick={exportCsv}
              disabled={sets[shownIndex].rows.length === 0}
              className="ml-auto rounded border border-slate-300 px-2 py-1 hover:bg-slate-50 disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>
          <ResultTable resultSet={sets[shownIndex]} />
        </div>
      )}

      {sets.length === 0 && result.success && (
        <p className="text-sm text-slate-500">Ran successfully. No result sets.</p>
      )}
    </div>
  )
}

function ResultTable({ resultSet }: { resultSet: ScriptRunResult['resultSets'][number] }) {
  return (
    <div className="max-h-[32rem] overflow-auto rounded border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="sticky top-0 bg-slate-100">
          <tr>
            {resultSet.columns.map((c, i) => (
              <th key={i} className="whitespace-nowrap px-3 py-2 text-left font-medium text-slate-700">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {resultSet.rows.map((row, r) => (
            <tr key={r} className="hover:bg-slate-50">
              {row.map((cell, c) => (
                <td key={c} className="whitespace-nowrap px-3 py-1.5 text-slate-700">
                  {cell === null ? <span className="text-slate-400 italic">NULL</span> : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
