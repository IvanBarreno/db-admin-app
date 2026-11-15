// target.ts — wording helpers for the target bar, the Execute buttons and the confirm recap.
// Kept apart from TargetBar.tsx so that file only exports a component (React fast refresh).

import type { OperationSummary } from '../api/operations'
import type { ServerSummary } from '../api/servers'
import { NONE, parseList } from './lookupText'

type Scope = OperationSummary['scope']

/** Where an operation of this scope will act, in words: the database, "server level" or "all online databases". */
export function scopeLabel(scope: Scope | null, database: string, server: ServerSummary): string {
  if (scope === 'Server') return 'server level'
  if (scope === 'AllDatabases') return 'all online databases'
  return database || server.defaultDatabase || '(login default database)'
}

/** Logins and users the operation will act on, as `[name]`. */
export function principalsOf(op: OperationSummary, values: Record<string, string>): string[] {
  return op.params
    .filter((p) => (p.type === 'Login' || p.type === 'User') && values[p.name])
    .map((p) => `[${values[p.name]}]`)
}

/**
 * One sentence saying what is about to happen and to whom: operation name, chosen options (ADD / DROP...)
 * and the principals typed or picked, e.g. "Enable / disable login · DISABLE · [zz_leaver]".
 */
export function describeOperation(op: OperationSummary, values: Record<string, string>): string {
  const choices = op.params.filter((p) => p.type === 'Choice' && values[p.name]).map((p) => values[p.name])

  // List parameters: "jobs: 2"; the add/drop pair of a role checklist reads "roles +2 −1".
  const lists = op.params
    .filter((p) => p.multi && !p.checklistGroup && values[p.name])
    .map((p) => {
      const items = parseList(values[p.name])
      return items.length === 1 && items[0] === NONE ? `${p.name}: none` : `${p.name}: ${items.length}`
    })
  const groups = new Set(op.params.filter((p) => p.checklistGroup).map((p) => p.checklistGroup!))
  const diffs = [...groups].map((group) => {
    const size = (action: string) =>
      parseList(values[op.params.find((p) => p.checklistGroup === group && p.checklistAction === action)?.name ?? '']).length
    return size('add') + size('drop') === 0 ? '' : `${group} +${size('add')} −${size('drop')}`
  })

  return [op.name, choices.join(' '), principalsOf(op, values).join(', '), ...lists, ...diffs].filter(Boolean).join(' · ')
}

/** "Execute on IB_LocalSQL · zz_lab_sales" — the button says where it will act. */
export function targetLabel(verb: string, server: ServerSummary | undefined, where: string | null): string {
  if (!server) return verb
  return `${verb} on ${server.name}${where ? ` · ${where}` : ''}`
}
