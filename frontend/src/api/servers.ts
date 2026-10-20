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
