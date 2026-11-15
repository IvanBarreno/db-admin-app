// useInOperation.ts — "Use in operation": from a row in the Explorer straight to the Operations page with the
// server, the database and that row's name already filled in.
//
// Nothing is hard-coded per operation: an operation is offered for a row when one of its single-value
// parameters is fed by the same lookup the table shows (YAML `source:` / a login, user or database type).
// A new operation in the YAML therefore appears in the Explorer by itself.

import type { OperationParameter, OperationSummary } from '../api/operations'

/** Explorer tables that show a richer variant of a picker's lookup: same names, more columns. */
const SAME_ITEMS_AS: Record<string, string> = {
  databases_detail: 'databases',
  sysadmins: 'logins',
}

/** One entry of the row menu: the operation, and which of its parameters receives the row's name. */
export interface OperationTarget {
  operation: OperationSummary
  param: OperationParameter
}

/**
 * Operations that can take an item of `lookupId` as a parameter. Only single-value parameters count: lists
 * and role checklists are ticked on the Operations page itself. The first matching parameter of an operation
 * wins (e.g. `login_name` before `new_owner`).
 */
export function operationsFor(operations: readonly OperationSummary[], lookupId: string): OperationTarget[] {
  const source = SAME_ITEMS_AS[lookupId] ?? lookupId
  const targets: OperationTarget[] = []
  for (const operation of operations) {
    const param = operation.params.find((p) => !p.multi && !p.checklistGroup && p.effectiveSource === source)
    if (param) targets.push({ operation, param })
  }
  return targets
}

/** Prefix of the query-string keys that carry parameter values (`p.login_name=alice`). */
const PARAM_PREFIX = 'p.'

/** The Operations page URL that opens `operationId` on `serverName` with `paramName` already set to `value`. */
export function operationLink(serverName: string, database: string, operationId: string, paramName: string, value: string): string {
  const query = new URLSearchParams({ server: serverName, operation: operationId })
  if (database) query.set('database', database)
  query.set(PARAM_PREFIX + paramName, value)
  return `/operations?${query.toString()}`
}

/** What the Operations page starts with, read back from such a URL (all blank for a plain /operations). */
export function readOperationLink(query: URLSearchParams): {
  serverName: string | null
  database: string
  operationId: string | null
  params: Record<string, string>
} {
  const params: Record<string, string> = {}
  for (const [key, value] of query) if (key.startsWith(PARAM_PREFIX)) params[key.slice(PARAM_PREFIX.length)] = value
  return {
    serverName: query.get('server') || null,
    database: query.get('database') ?? '',
    operationId: query.get('operation') || null,
    params,
  }
}
