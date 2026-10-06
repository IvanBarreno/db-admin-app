// operations.ts — hooks for /api/operations: list, preview, execute.

import { useMutation, useQuery } from '@tanstack/react-query'
import { apiGet, apiPost, type Schema } from './client'

export type OperationSummary = Schema<'OperationSummary'>
export type OperationParameter = Schema<'OperationParameter'>
export type OperationRequest = Schema<'OperationRequest'>
export type OperationPreviewResult = Schema<'OperationPreviewResult'>
export type OperationExecuteResult = Schema<'OperationExecuteResult'>

/** Operations available for a server, filtered by its engine. */
export function useOperations(serverName: string | null) {
  return useQuery({
    queryKey: ['operations', serverName],
    queryFn: ({ signal }) => apiGet<OperationSummary[]>(`/api/operations?server=${encodeURIComponent(serverName!)}`, signal),
    enabled: serverName !== null,
    staleTime: 60_000,
  })
}

/** Render the operation's template; nothing executes. */
export function usePreviewOperation(operationId: string) {
  return useMutation({
    mutationKey: ['operations', operationId, 'preview'],
    mutationFn: (request: OperationRequest) =>
      apiPost<OperationPreviewResult, OperationRequest>(`/api/operations/${encodeURIComponent(operationId)}/preview`, request),
  })
}

/** Run the operation for real. */
export function useExecuteOperation(operationId: string) {
  return useMutation({
    mutationKey: ['operations', operationId, 'execute'],
    mutationFn: (request: OperationRequest) =>
      apiPost<OperationExecuteResult, OperationRequest>(`/api/operations/${encodeURIComponent(operationId)}/execute`, request),
  })
}
