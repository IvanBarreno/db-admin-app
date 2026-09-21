// customSql.ts — hook for POST /api/custom-sql.

import { useMutation } from '@tanstack/react-query'
import { apiPost, type Schema } from './client'

export type CustomSqlRequest = Schema<'CustomSqlRequest'>
export type CustomSqlResult = Schema<'CustomSqlResult'>

/** Runs free-form SQL against a server. Not cached — every run is a fresh POST. */
export function useRunCustomSql() {
  return useMutation({
    mutationFn: (request: CustomSqlRequest) => apiPost<CustomSqlResult, CustomSqlRequest>('/api/custom-sql', request),
  })
}
