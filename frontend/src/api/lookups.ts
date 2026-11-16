// lookups.ts — server-driven lists (logins, users, roles, jobs, ...) from GET /api/servers/{s}/lookups/{id}.
//
// One hook feeds every picker. The definitions live in the API (lookups/*.yaml), so adding a list
// never needs frontend changes; only the form that wants to show it has to name it.

import { useQuery } from '@tanstack/react-query'
import { apiGet, type Schema } from './client'

export type LookupResult = Schema<'LookupResult'>
export type LookupItem = Schema<'LookupItem'>

/**
 * Rows of one lookup. `args` are the values of the lookup's declared arguments (e.g. `login_name`);
 * `database` is only needed by database-scoped lookups (users, database roles, schemas...).
 * The query waits (`enabled: false`) until it has a server, and a database when `needsDatabase` is set.
 */
export function useLookup(
  serverName: string | null,
  lookupId: string | null,
  options: { database?: string; args?: Record<string, string>; needsDatabase?: boolean } = {},
) {
  const { database = '', args = {}, needsDatabase = false } = options
  const params = new URLSearchParams()
  if (database) params.set('database', database)
  for (const [key, value] of Object.entries(args)) if (value) params.set(key, value)
  const query = params.toString()

  return useQuery({
    // Everything that changes the answer is in the key, so a new server/database/arg refetches.
    queryKey: ['lookups', serverName, lookupId, database, args],
    queryFn: ({ signal }) =>
      apiGet<LookupResult>(
        `/api/servers/${encodeURIComponent(serverName!)}/lookups/${encodeURIComponent(lookupId!)}${query ? `?${query}` : ''}`,
        signal,
      ),
    enabled: serverName !== null && lookupId !== null && (!needsDatabase || !!database),
    staleTime: 30_000,
    // A 404 (no variant for this engine) or 5xx must not hammer the server; the form falls back to free text.
    retry: false,
  })
}
