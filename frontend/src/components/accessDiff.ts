// accessDiff.ts — comparing what two principals hold. Pure functions (no React), shared by the clone preview
// (AccessComparison) and the Explorer's "Compare logins" view (LoginDiff).
//
// Input: rows of the `server_access` / `database_access` lookups — one row per role membership or explicit
// permission, with `kind`, `item` and `state` (MEMBER, GRANT, DENY, GRANT_WITH_GRANT_OPTION) as extra columns.

import type { LookupItem } from '../api/lookups'

/** One thing a principal holds: a role membership or an explicit permission. */
export interface Access {
  kind: 'ROLE' | 'PERMISSION'
  item: string
  state: string
}

/** Lookup rows keyed by their value ("ROLE:sysadmin", "PERMISSION:VIEW SERVER STATE"), which is the same on both sides. */
export function toAccess(items: readonly LookupItem[] | undefined): Map<string, Access> {
  const map = new Map<string, Access>()
  for (const i of items ?? []) {
    const extra = i.extra as Record<string, unknown>
    map.set(i.value, { kind: extra.kind as Access['kind'], item: String(extra.item), state: String(extra.state) })
  }
  return map
}

/** One line of a comparison: what each side holds for the same role or permission (undefined = nothing). */
export interface AccessDiffRow {
  key: string
  kind: Access['kind']
  item: string
  left?: string
  right?: string
  /** True when the two sides are not identical: one lacks it, or the states differ (GRANT vs DENY). */
  differs: boolean
}

/** Every role / permission held by either side, roles first, then by name. */
export function compareAccess(left: Map<string, Access>, right: Map<string, Access>): AccessDiffRow[] {
  const rows = [...new Set([...left.keys(), ...right.keys()])].map((key) => {
    const l = left.get(key)
    const r = right.get(key)
    const any = (l ?? r)!
    return { key, kind: any.kind, item: any.item, left: l?.state, right: r?.state, differs: l?.state !== r?.state }
  })
  // Roles before permissions ("ROLE" > "PERMISSION" alphabetically, hence the explicit order).
  rows.sort((a, b) => (a.kind === b.kind ? a.item.localeCompare(b.item) : a.kind === 'ROLE' ? -1 : 1))
  return rows
}
