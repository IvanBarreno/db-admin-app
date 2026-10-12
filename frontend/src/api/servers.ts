// servers.ts — hooks for /api/servers.
//
// Two kinds of hooks appear here:
//   useQuery    → READ data, cached by key, refetched when stale  (list servers, list databases)
//   useMutation → DO something on demand, not cached              (test a connection)

import { useMutation, useQuery } from '@tanstack/react-query'
import { apiGet, apiPost, type Schema } from './client'

export type ServerSummary = Schema<'ServerSummary'>
export type ConnectionTestResult = Schema<'ConnectionTestResult'>
export type DatabaseInfo = Schema<'DatabaseInfo'>
export type LoginInfo = Schema<'LoginInfo'>
export type DatabaseUserInfo = Schema<'DatabaseUserInfo'>

/** All configured servers. Config only changes on restart, so cache it for the session. */
export function useServers() {
  return useQuery({
    queryKey: ['servers'],
    queryFn: ({ signal }) => apiGet<ServerSummary[]>('/api/servers', signal),
    staleTime: Infinity,
  })
}

/**
 * Connection test. `mutate()` / `mutateAsync()` fire the POST; the hook exposes
 * isPending / data / error for the button and result panel.
 */
export function useTestConnection(serverName: string) {
  return useMutation({
    mutationKey: ['servers', serverName, 'test'],
    mutationFn: () => apiPost<ConnectionTestResult, undefined>(`/api/servers/${encodeURIComponent(serverName)}/test`, undefined),
  })
}

/**
 * Databases on a server, for pickers. `enabled: false` until a server is chosen so the
 * hook can be declared unconditionally (React rules) without firing a request.
 */
export function useDatabases(serverName: string | null) {
  return useQuery({
    queryKey: ['servers', serverName, 'databases'],
    queryFn: ({ signal }) => apiGet<DatabaseInfo[]>(`/api/servers/${encodeURIComponent(serverName!)}/databases`, signal),
    enabled: serverName !== null,
    staleTime: 60_000,
  })
}

/** Server logins for the `Login` parameter picker. Only fetched once a server is chosen and a picker needs it. */
export function useLogins(serverName: string | null, enabled = true) {
  return useQuery({
    queryKey: ['servers', serverName, 'logins'],
    queryFn: ({ signal }) => apiGet<LoginInfo[]>(`/api/servers/${encodeURIComponent(serverName!)}/logins`, signal),
    enabled: enabled && serverName !== null,
    staleTime: 60_000,
  })
}

/** Users of one database for the `User` parameter picker; waits until both server and database are known. */
export function useDatabaseUsers(serverName: string | null, database: string | null, enabled = true) {
  return useQuery({
    queryKey: ['servers', serverName, 'databases', database, 'users'],
    queryFn: ({ signal }) =>
      apiGet<DatabaseUserInfo[]>(
        `/api/servers/${encodeURIComponent(serverName!)}/databases/${encodeURIComponent(database!)}/users`,
        signal,
      ),
    enabled: enabled && serverName !== null && !!database,
    staleTime: 60_000,
  })
}
