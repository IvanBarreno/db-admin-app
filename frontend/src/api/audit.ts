// audit.ts — hooks for /api/audit, the read-only view over the audit log.

import { useQuery } from '@tanstack/react-query'
import { apiGet, type Schema } from './client'

export type AuditEntry = Schema<'AuditEntryResponse'>

export interface AuditFilters {
  executedBy?: string
  serverName?: string
  status?: string
  skip?: number
  take?: number
}

/** Audit entries, newest first, refetched whenever the filters change. */
export function useAuditLog(filters: AuditFilters) {
  const params = new URLSearchParams()
  if (filters.executedBy) params.set('executedBy', filters.executedBy)
  if (filters.serverName) params.set('serverName', filters.serverName)
  if (filters.status) params.set('status', filters.status)
  params.set('skip', String(filters.skip ?? 0))
  params.set('take', String(filters.take ?? 50))

  return useQuery({
    queryKey: ['audit', filters],
    queryFn: ({ signal }) => apiGet<AuditEntry[]>(`/api/audit?${params.toString()}`, signal),
  })
}
