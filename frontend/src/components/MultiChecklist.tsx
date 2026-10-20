import { useState } from 'react'
import type { OperationParameter } from '../api/operations'
import { useLookup } from '../api/lookups'
import { NONE, encodeList, lookupHint, parseList } from './lookupText'

/**
 * A list parameter shown as a checklist fed by a server-side lookup (sessions, jobs, databases, logins...).
 *
 * `defaultAll` lists start with everything ticked and an EMPTY value ("all"): the DBA only unticks what
 * should be left alone. Unticking everything is sent as "(none)", never as an empty list, so "nothing"
 * can never be read as "all". Other lists start empty.
 *
 * If the lookup cannot be read (no permission, Azure...), the field falls back to names separated by commas.
 */
export function MultiChecklist({
  param,
  value,
  onChange,
  serverName,
  database,
  values,
}: {
  param: OperationParameter
  value: string
  onChange: (value: string) => void
  serverName: string | null
  database: string
  values: Record<string, string>
}) {
  const [filter, setFilter] = useState('')

  const args: Record<string, string> = {}
  for (const name of param.dependsOn ?? []) args[name] = values[name] ?? ''

  const query = useLookup(serverName, param.effectiveSource ?? null, { database, args })
  const items = query.data?.items ?? []
  const warning = query.data?.warning ?? null
  const usable = query.isSuccess && !warning

  const allValues = items.map((i) => i.value)
  const explicit = parseList(value)
  const selected = new Set(param.defaultAll && value === '' ? allValues : explicit)

  function commit(next: Set<string>) {
    const picked = allValues.filter((v) => next.has(v)) // list order, ignoring anything the server no longer lists
    if (param.defaultAll) {
      if (picked.length === allValues.length) onChange('') // everything = "all"
      else if (picked.length === 0) onChange(JSON.stringify([NONE]))
      else onChange(encodeList(picked))
    } else {
      onChange(encodeList(picked))
    }
  }

  function toggle(itemValue: string) {
    const next = new Set(selected)
    if (next.has(itemValue)) next.delete(itemValue)
    else next.add(itemValue)
    commit(next)
  }

  const shown = items.filter((i) => `${i.value} ${lookupHint(i)}`.toLowerCase().includes(filter.toLowerCase()))
  const needsDatabase = query.isError && !database
  const loading = query.isPending && query.fetchStatus !== 'idle'
  const count = [...selected].filter((v) => allValues.includes(v)).length

  return (
    <div className="rounded border border-slate-200 text-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-3 py-1.5">
        <span className="font-medium text-slate-700">
          {param.name}
          {param.required && <span className="text-red-600"> *</span>}
        </span>
        {usable && (
          <>
            <span className="text-xs text-slate-500">
              {count} of {items.length} selected
              {param.defaultAll && value === '' && ' (all)'}
            </span>
            <button type="button" onClick={() => commit(new Set(allValues))} className="text-xs text-slate-600 underline">
              All
            </button>
            <button type="button" onClick={() => commit(new Set())} className="text-xs text-slate-600 underline">
              None
            </button>
            {items.length > 8 && (
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="filter…"
                className="ml-auto rounded border border-slate-300 px-2 py-0.5 text-xs"
              />
            )}
          </>
        )}
      </div>

      <div className="max-h-52 overflow-y-auto px-3 py-1.5">
        {needsDatabase && <p className="text-slate-500">Select a database first.</p>}
        {loading && <p className="text-slate-500">Loading…</p>}

        {usable && items.length === 0 && <p className="text-slate-500">Nothing to list.</p>}
        {usable &&
          shown.map((item) => (
            <label key={item.value} className="flex items-center gap-2 py-0.5">
              <input type="checkbox" checked={selected.has(item.value)} onChange={() => toggle(item.value)} />
              <span className="font-mono text-xs text-slate-800">{item.value}</span>
              <span className="text-xs text-slate-500">{lookupHint(item)}</span>
            </label>
          ))}

        {!usable && !needsDatabase && !loading && (
          <div className="space-y-1">
            <p className="text-xs text-amber-700">{warning ?? 'List unavailable'} — type names separated by commas.</p>
            <input
              type="text"
              value={explicit.join(', ')}
              onChange={(e) =>
                onChange(
                  encodeList(
                    e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  ),
                )
              }
              className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs"
            />
          </div>
        )}
      </div>
    </div>
  )
}
