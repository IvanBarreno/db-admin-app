import { useEffect, useState } from 'react'
import type { OperationParameter } from '../api/operations'
import { NONE, encodeList, lookupHint, parseList } from './lookupText'
import { useLookupState, type BlockReporter } from './lookupState'

/**
 * A list parameter shown as a checklist fed by a server-side lookup (sessions, jobs, databases, logins...).
 *
 * `defaultAll` lists start with everything ticked and an EMPTY value ("all"): the DBA only unticks what
 * should be left alone. Unticking everything is sent as "(none)", never as an empty list, so "nothing"
 * can never be read as "all". Other lists start empty.
 *
 * A list that cannot be loaded is not offered: the box says why (nothing exists, no permission, not available
 * for this engine, choose something first). A REQUIRED list in that state also blocks the form.
 * Protected logins (the account the app connects with) are shown locked, unless the operation only reads.
 */
export function MultiChecklist({
  param,
  value,
  onChange,
  serverName,
  database,
  values,
  allowProtected,
  onBlock,
}: {
  param: OperationParameter
  value: string
  onChange: (value: string) => void
  serverName: string | null
  database: string
  values: Record<string, string>
  /** True for read-only operations (audits), which may look at protected logins. */
  allowProtected: boolean
  onBlock?: BlockReporter
}) {
  const [filter, setFilter] = useState('')

  const args: Record<string, string> = {}
  for (const name of param.dependsOn ?? []) args[name] = values[name] ?? ''

  const state = useLookupState(serverName, param.effectiveSource ?? null, { database, args })
  const items = state.items
  const usable = state.status === 'ready'

  const lockedBy = (extra: unknown): string | undefined => {
    const e = extra as Record<string, unknown>
    return !allowProtected && param.protect !== false && e.is_protected === true ? String(e.protected_reason ?? 'protected') : undefined
  }
  const selectable = items.filter((i) => !lockedBy(i.extra))

  // Tell the form when a REQUIRED list has nothing to choose from.
  const blocking = param.required && state.status !== 'ready' && state.status !== 'loading' ? (state.reason ?? 'Nothing to choose from.') : null
  useEffect(() => {
    onBlock?.(param.name, blocking)
    return () => onBlock?.(param.name, null)
  }, [onBlock, param.name, blocking])

  const allValues = selectable.map((i) => i.value)
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
  const count = [...selected].filter((v) => allValues.includes(v)).length

  return (
    <div className="rounded border border-slate-200 text-sm" title={param.help ?? undefined}>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-3 py-1.5">
        <span className="font-medium text-slate-700">
          {param.label ?? param.name.replaceAll('_', ' ')}
          {param.required && <span className="text-red-600"> *</span>}
        </span>
        {usable && (
          <>
            <span className="text-xs text-slate-500">
              {count} of {selectable.length} selected
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

      {param.help && <p className="px-3 pt-1 text-xs text-slate-500">{param.help}</p>}

      <div className="max-h-52 overflow-y-auto px-3 py-1.5">
        {state.status === 'loading' && <p className="text-slate-500">Loading…</p>}

        {(state.status === 'idle' || state.status === 'waiting' || state.status === 'empty' || state.status === 'unavailable') && (
          <p className={state.status === 'unavailable' ? 'text-amber-700' : 'text-slate-500'}>
            {state.reason}
            {state.retryable && (
              <button type="button" onClick={state.retry} className="ml-2 underline">
                Retry
              </button>
            )}
          </p>
        )}

        {usable &&
          shown.map((item) => {
            const lock = lockedBy(item.extra)
            const description = (item.extra as Record<string, unknown>).description
            return (
              <label key={item.value} className={`flex items-center gap-2 py-0.5 ${lock ? 'text-slate-400' : ''}`} title={lock ?? (typeof description === 'string' ? description : undefined)}>
                <input type="checkbox" checked={!lock && selected.has(item.value)} disabled={lock !== undefined} onChange={() => toggle(item.value)} />
                <span className="font-mono text-xs text-slate-800">{item.value}</span>
                {lock ? (
                  <span className="text-xs">🔒 view only — {lock}</span>
                ) : (
                  <span className="text-xs text-slate-500">{lookupHint(item)}</span>
                )}
              </label>
            )
          })}
      </div>
    </div>
  )
}
