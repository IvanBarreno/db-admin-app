import { useState } from 'react'
import type { CustomSqlResult } from '../api/customSql'

/** Renders every result set as a tab (batch #N) plus provider messages and the failure, if any. */
export function ResultsGrid({ result }: { result: CustomSqlResult }) {
  const [activeTab, setActiveTab] = useState(0)
  const sets = result.resultSets

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
          <ResultTable resultSet={sets[Math.min(activeTab, sets.length - 1)]} />
        </div>
      )}

      {sets.length === 0 && result.success && (
        <p className="text-sm text-slate-500">Ran successfully. No result sets.</p>
      )}
    </div>
  )
}

function ResultTable({ resultSet }: { resultSet: CustomSqlResult['resultSets'][number] }) {
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
