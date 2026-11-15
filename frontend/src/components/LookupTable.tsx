import { useMemo, useState } from 'react'
import { useLookup, type LookupItem } from '../api/lookups'
import { downloadCsv, toCsv } from './csv'
import { formatCell } from './lookupText'

type SortState = { column: string; descending: boolean } | null

/** Value of one column of a row: the synthetic "name" column is the lookup's `value`, the rest are its extras. */
function cell(item: LookupItem, column: string): unknown {
  return column === 'name' ? item.value : (item.extra as Record<string, unknown>)[column]
}

/**
 * Any lookup as a table: searchable, sortable by clicking a header, with the row count and a CSV export.
 * It shows exactly what the server answered (first column = the lookup's `value`, then every extra column), so
 * a new lookup in `lookups/*.yaml` becomes browsable with no frontend change.
 */
export function LookupTable({
  serverName,
  lookupId,
  database = '',
  args = {},
  filter,
  title,
  emptyText = 'Nothing to list.',
  rowAction,
}: {
  /** Extra last cell per row (e.g. the Explorer's "Use in operation" menu). Omit it for a plain table. */
  rowAction?: (item: LookupItem) => React.ReactNode
  serverName: string
  lookupId: string
  /** Database for database-scoped lookups. */
  database?: string
  /** Lookup arguments, e.g. `{ login_name: 'zz_leaver' }`. */
  args?: Record<string, string>
  /** Keeps only some rows (e.g. the roles a login is a member of). */
  filter?: (item: LookupItem) => boolean
  title?: string
  emptyText?: string
}) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortState>(null)

  const query = useLookup(serverName, lookupId, { database, args })
  const warning = query.data?.warning ?? null

  const items = useMemo(() => {
    const all = query.data?.items ?? []
    return filter ? all.filter(filter) : all
  }, [query.data, filter])

  // Columns: the value, then the extra columns in the order the server returned them.
  const columns = useMemo(() => {
    const names = new Set<string>()
    for (const item of items) for (const key of Object.keys(item.extra)) names.add(key)
    return ['name', ...names]
  }, [items])

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const shown = needle
      ? items.filter((item) => columns.some((c) => formatCell(cell(item, c)).toLowerCase().includes(needle)))
      : [...items]
    if (sort) {
      shown.sort((a, b) => {
        const x = cell(a, sort.column)
        const y = cell(b, sort.column)
        const order =
          typeof x === 'number' && typeof y === 'number' ? x - y : formatCell(x).localeCompare(formatCell(y), undefined, { numeric: true })
        return sort.descending ? -order : order
      })
    }
    return shown
  }, [items, columns, search, sort])

  function exportCsv() {
    // The rows as shown (current search and sort), with the same cell text as the table.
    downloadCsv(lookupId, toCsv(columns, rows.map((item) => columns.map((c) => formatCell(cell(item, c))))))
  }

  function toggleSort(column: string) {
    setSort((current) => (current?.column === column ? (current.descending ? null : { column, descending: true }) : { column, descending: false }))
  }

  return (
    <div className="rounded border border-slate-200 bg-white text-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-3 py-2">
        {title && <span className="font-medium text-slate-700">{title}</span>}
        {query.isSuccess && !warning && (
          <>
            <span className="text-xs text-slate-500">
              {rows.length === items.length ? `${items.length} rows` : `${rows.length} of ${items.length} rows`}
            </span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search…"
              className="rounded border border-slate-300 px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={exportCsv}
              disabled={rows.length === 0}
              className="ml-auto rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
            >
              Export CSV
            </button>
          </>
        )}
      </div>

      {query.isPending && query.fetchStatus !== 'idle' && <p className="px-3 py-2 text-slate-500">Loading…</p>}
      {query.isError && <p className="px-3 py-2 text-red-700">{query.error.message}</p>}
      {warning && <p className="px-3 py-2 text-amber-700">{warning}</p>}
      {query.isSuccess && !warning && items.length === 0 && <p className="px-3 py-2 text-slate-500">{emptyText}</p>}

      {query.isSuccess && !warning && items.length > 0 && (
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-600">
              <tr>
                {columns.map((c) => (
                  <th key={c} className="cursor-pointer whitespace-nowrap px-3 py-1.5 font-medium" onClick={() => toggleSort(c)}>
                    {c.replaceAll('_', ' ')}
                    {sort?.column === c && (sort.descending ? ' ▼' : ' ▲')}
                  </th>
                ))}
                {rowAction && <th className="px-3 py-1.5" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.value} className="border-t border-slate-100 hover:bg-slate-50">
                  {columns.map((c) => (
                    <td key={c} className={`whitespace-nowrap px-3 py-1 ${c === 'name' ? 'font-mono text-xs' : 'text-slate-700'}`}>
                      {formatCell(cell(item, c))}
                    </td>
                  ))}
                  {rowAction && <td className="whitespace-nowrap px-3 py-1 text-right">{rowAction(item)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
