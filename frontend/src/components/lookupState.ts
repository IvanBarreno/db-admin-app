// lookupState.ts — one answer to "can this field offer a list right now, and if not, why?".
//
// Every lookup-driven control (combobox, checklists) uses it, so a field that cannot load its list is
// disabled with the SAME kind of explanation everywhere: nothing exists on the server, the login may not read
// it, the list is not available for this engine, or something else has to be chosen first.

import { ApiError } from '../api/client'
import { useLookup, type LookupItem } from '../api/lookups'

export type LookupStatus =
  /** No server chosen yet. */
  | 'idle'
  /** Something this list depends on (a database, a login) is not chosen yet. */
  | 'waiting'
  | 'loading'
  | 'ready'
  /** Readable, but the server has nothing to list (no orphaned users in this database…). */
  | 'empty'
  /** Cannot be read: permission, not available for this engine, or an error. */
  | 'unavailable'

export interface LookupState {
  status: LookupStatus
  /** Words for the DBA explaining `waiting` / `empty` / `unavailable`; null otherwise. */
  reason: string | null
  items: LookupItem[]
  /** True for failures that may pass (timeouts, server errors), where a Retry button makes sense. */
  retryable: boolean
  retry: () => void
}

/** Reports "this field cannot be filled in" to the form, so the Preview / Execute buttons can say why they are off. */
export type BlockReporter = (parameter: string, reason: string | null) => void

/** "login_name" → "login", "roles_to_add" → "roles to add": a name for messages. */
export function humanize(name: string): string {
  return name.replace(/_name$/, '').replaceAll('_', ' ')
}

export function useLookupState(
  serverName: string | null,
  lookupId: string | null,
  options: { database?: string; args?: Record<string, string> } = {},
): LookupState {
  const { database = '', args = {} } = options

  // A list that depends on other fields (the roles OF a login) is not asked for until they are filled in.
  const missing = Object.entries(args).filter(([, value]) => value === '').map(([name]) => name)
  const query = useLookup(missing.length > 0 ? null : serverName, lookupId, { database, args })

  const none = { items: [] as LookupItem[], retryable: false, retry: () => {} }

  if (serverName === null) return { ...none, status: 'idle', reason: 'Select a server first.' }
  if (missing.length > 0) return { ...none, status: 'waiting', reason: `Choose the ${humanize(missing[0])} first.` }

  const retry = () => void query.refetch()

  if (query.isPending) return { ...none, status: 'loading', reason: null }

  if (query.isError) {
    const error = query.error
    if (error instanceof ApiError && error.status === 404) {
      return { ...none, status: 'unavailable', reason: 'Not available for this server’s engine (for example Azure SQL has no SQL Agent).' }
    }
    // A database-scoped list asked without a database answers 400: that is "choose a database", not a failure.
    if (error instanceof ApiError && error.status === 400 && !database) {
      return { ...none, status: 'waiting', reason: 'Select a database first.' }
    }
    return { ...none, status: 'unavailable', reason: `Could not load the list: ${error.message}`, retryable: true, retry }
  }

  const result = query.data
  if (result.warning) {
    const reason =
      result.reason === 'permission'
        ? `This account is not allowed to read it: it needs ${result.requires ?? 'more permissions'}.`
        : `Could not load the list: ${result.warning}`
    return { ...none, status: 'unavailable', reason, retryable: result.reason !== 'permission', retry }
  }

  if (result.items.length === 0) {
    return { ...none, status: 'empty', reason: result.emptyText ?? 'Nothing to list on this server.', retry }
  }

  return { status: 'ready', reason: null, items: result.items, retryable: false, retry }
}
