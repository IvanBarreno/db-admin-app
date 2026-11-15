import { useLookup, type LookupItem } from '../api/lookups'

/** One row of the `server_access` lookup: a server role membership or an explicit server permission. */
interface Access {
  kind: 'ROLE' | 'PERMISSION'
  item: string
  state: string
}

function toAccess(items: readonly LookupItem[] | undefined): Map<string, Access> {
  const map = new Map<string, Access>()
  for (const i of items ?? []) {
    const extra = i.extra as Record<string, unknown>
    map.set(i.value, { kind: extra.kind as Access['kind'], item: String(extra.item), state: String(extra.state) })
  }
  return map
}

/**
 * Side-by-side preview of "Clone server access": what the source holds, what the target holds now, and what the
 * target will hold afterwards (only ADDS or overrides; nothing is removed). Rows that change are highlighted.
 * It reads the same facts the operation reads, so it is a preview of the result and the statements list stays
 * the exact SQL. CONNECT SQL is left out, as the operation skips it.
 */
export function AccessComparison({
  serverName,
  source,
  target,
  includeRoles,
  includePermissions,
}: {
  serverName: string | null
  source: string
  target: string
  includeRoles: boolean
  includePermissions: boolean
}) {
  const from = useLookup(source ? serverName : null, 'server_access', { args: { login_name: source } })
  const to = useLookup(target ? serverName : null, 'server_access', { args: { login_name: target } })

  if (!source || !target) {
    return <p className="text-xs text-slate-500">Pick both logins to compare what each one holds and what the target will end up with.</p>
  }
  if (from.isPending || to.isPending) return <p className="text-xs text-slate-500">Reading both logins…</p>
  const failed = from.isError ? from.error.message : to.isError ? to.error.message : (from.data?.warning ?? to.data?.warning)
  if (failed) return <p className="text-xs text-amber-700">Could not read their access for the comparison: {failed}</p>

  const sourceAccess = toAccess(from.data?.items)
  const targetAccess = toAccess(to.data?.items)

  const rows = [...new Set([...sourceAccess.keys(), ...targetAccess.keys()])].map((key) => {
    const s = sourceAccess.get(key)
    const t = targetAccess.get(key)
    const kind = (s ?? t)!.kind
    const copied = kind === 'ROLE' ? includeRoles : includePermissions
    // Roles are only added. A permission the source holds is applied as the source has it (a DENY overrides a GRANT).
    const after = s && copied ? s.state : t?.state
    return { key, kind, item: (s ?? t)!.item, source: s?.state, now: t?.state, after, changes: after !== t?.state }
  })
  rows.sort((a, b) => a.kind.localeCompare(b.kind) || a.item.localeCompare(b.item))

  const changing = rows.filter((r) => r.changes).length

  return (
    <div className="space-y-1">
      <p className="text-xs text-slate-600">
        {changing === 0 ? 'Nothing to copy: the target already has everything the source has.' : `${changing} change${changing === 1 ? '' : 's'} to [${target}]; nothing is removed.`}
      </p>
      <div className="max-h-80 overflow-auto rounded border border-slate-200">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-2 py-1">Type</th>
              <th className="px-2 py-1">Item</th>
              <th className="px-2 py-1">[{source}] (source)</th>
              <th className="px-2 py-1">[{target}] now</th>
              <th className="px-2 py-1">[{target}] after</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-2 text-slate-500">
                  Neither login holds server roles or explicit server permissions.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.key} className={r.changes ? 'bg-emerald-50' : ''}>
                <td className="px-2 py-1 text-slate-500">{r.kind === 'ROLE' ? 'Role' : 'Permission'}</td>
                <td className="px-2 py-1 font-mono">{r.item}</td>
                <td className="px-2 py-1">{r.source ?? '—'}</td>
                <td className="px-2 py-1">{r.now ?? '—'}</td>
                <td className={`px-2 py-1 ${r.changes ? 'font-medium text-emerald-800' : ''}`}>
                  {r.after ?? '—'}
                  {r.changes && ' ← new'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
