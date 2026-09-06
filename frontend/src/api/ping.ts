// ping.ts — React hook for GET /api/ping.
//
// Pattern for every API resource: one file, one (or a few) TanStack Query hooks.
// Components never call fetch directly; they call a hook and get
// { data, isPending, isError, error } with caching and refetching for free.

import { useQuery } from '@tanstack/react-query'
import { apiGet, type Schema } from './client'

export type PingResponse = Schema<'PingResponse'>

export function usePing() {
  return useQuery({
    // The cache key. Any component using ['ping'] shares the same cached result.
    queryKey: ['ping'],
    // `signal` aborts the fetch if the component unmounts before the response arrives.
    queryFn: ({ signal }) => apiGet<PingResponse>('/api/ping', signal),
    // Re-check the API every 10 s so the header badge notices if the backend goes away.
    refetchInterval: 10_000,
  })
}
