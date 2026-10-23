import { useState } from 'react'
import type { OperationParameter } from '../api/operations'
import { encodeList, parseList } from './lookupText'
import { useLookupState } from './lookupState'

/**
 * Roles of one principal as a single checklist. The ticks start from the server's own membership
 * (the lookup's `is_member` column); the form sends only the DIFFERENCE, in two list parameters
 * (`add` and `drop`). So unticking a role the login has means "drop it", ticking one it lacks means
 * "add it", and leaving a role alone sends nothing — only drops need the destructive confirmation.
 * Each role shows what it allows (the server-side description) as muted text and a tooltip.
 */
export function RoleChecklist({
  addParam,
  dropParam,
  values,
  onChange,
  serverName,
  database,
}: {
  addParam: OperationParameter
  dropParam: OperationParameter
  values: Record<string, string>
  /** Receives both list parameters at once. */
  onChange: (patch: Record<string, string>) => void
  serverName: string | null
  database: string
}) {
  const [filter, setFilter] = useState('')

  const args: Record<string, string> = {}
  for (const name of addParam.dependsOn ?? []) args[name] = values[name] ?? ''

  const state = useLookupState(serverName, addParam.effectiveSource ?? null, { database, args })
  const items = state.items
  const usable = state.status === 'ready'

  const adds = new Set(parseList(values[addParam.name]))
  const drops = new Set(parseList(values[dropParam.name]))

  const isMember = (extra: unknown) => (extra as Record<string, unknown>).is_member === true
  const isTicked = (item: (typeof items)[number]) => (isMember(item.extra) ? !drops.has(item.value) : adds.has(item.value))

  function toggle(item: (typeof items)[number]) {
    const nextAdds = new Set(adds)
    const nextDrops = new Set(drops)
    if (isMember(item.extra)) {
      // A role the principal HAS: unticking drops it, re-ticking cancels the drop.
      if (nextDrops.has(item.value)) nextDrops.delete(item.value)
      else nextDrops.add(item.value)
    } else if (nextAdds.has(item.value)) {
      nextAdds.delete(item.value)
    } else {
      nextAdds.add(item.value)
    }
    onChange({
      [addParam.name]: encodeList([...nextAdds].sort()),
      [dropParam.name]: encodeList([...nextDrops].sort()),
    })
  }

  const shown = items.filter((i) => i.value.toLowerCase().includes(filter.toLowerCase()))
  const summary =
    adds.size + drops.size === 0
      ? 'No changes'
      : [adds.size > 0 && `ADD ${[...adds].sort().join(', ')}`, drops.size > 0 && `DROP ${[...drops].sort().join(', ')}`]
          .filter(Boolean)
          .join(' · ')

  return (
    <div className="rounded border border-slate-200 text-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-3 py-1.5">
        <span className="font-medium text-slate-700" title="Tick a role to add the principal to it, untick one it has to remove it.">
          roles
        </span>
        {usable && (
          <span className={`text-xs ${adds.size + drops.size > 0 ? 'font-medium text-slate-900' : 'text-slate-500'}`}>{summary}</span>
        )}
        {usable && items.length > 12 && (
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter…"
            className="ml-auto rounded border border-slate-300 px-2 py-0.5 text-xs"
          />
        )}
      </div>

      <div className="max-h-60 overflow-y-auto px-3 py-1.5">
        {state.status === 'loading' && <p className="text-slate-500">Loading roles…</p>}

        {(state.status === 'idle' || state.status === 'waiting' || state.status === 'empty' || state.status === 'unavailable') && (
          <p className={state.status === 'unavailable' ? 'text-amber-700' : 'text-slate-500'}>
            {state.status === 'waiting' ? `${state.reason} Its current roles will be ticked.` : state.reason}
            {state.retryable && (
              <button type="button" onClick={state.retry} className="ml-2 underline">
                Retry
              </button>
            )}
          </p>
        )}

        {usable &&
          shown.map((item) => {
            const extra = item.extra as Record<string, unknown>
            const member = isMember(extra)
            const ticked = isTicked(item)
            const change = member && !ticked ? 'drop' : !member && ticked ? 'add' : null
            const description = typeof extra.description === 'string' ? extra.description : null
            return (
              <label key={item.value} className="flex flex-wrap items-center gap-x-2 py-0.5" title={description ?? undefined}>
                <input type="checkbox" checked={ticked} onChange={() => toggle(item)} />
                <span className={`font-mono text-xs ${change === 'drop' ? 'text-red-700 line-through' : 'text-slate-800'}`}>{item.value}</span>
                {extra.is_high_risk === true && <span className="text-xs font-medium text-amber-700">⚠ high risk</span>}
                {extra.is_fixed_role === false && <span className="text-xs text-slate-500">custom</span>}
                {change === 'add' && <span className="text-xs font-medium text-emerald-700">will add</span>}
                {change === 'drop' && <span className="text-xs font-medium text-red-700">will drop</span>}
                {change === null && member && <span className="text-xs text-slate-400">member</span>}
                {description && <span className="text-xs text-slate-500">— {description}</span>}
              </label>
            )
          })}
      </div>
    </div>
  )
}
