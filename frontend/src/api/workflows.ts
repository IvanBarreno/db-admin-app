// workflows.ts — hooks for /api/workflows: guided checklists (today: offboarding).

import { useMutation, useQuery } from '@tanstack/react-query'
import { apiGet, apiPost, type Schema } from './client'

export type WorkflowSummary = Schema<'WorkflowSummary'>
export type WorkflowStepSummary = Schema<'WorkflowStepSummary'>
export type WorkflowRequest = Schema<'WorkflowRequest'>
export type WorkflowPreviewResult = Schema<'WorkflowPreviewResult'>
export type WorkflowExecuteResult = Schema<'WorkflowExecuteResult'>
export type WorkflowStepResult = Schema<'WorkflowStepResult'>

export function useWorkflows() {
  return useQuery({
    queryKey: ['workflows'],
    queryFn: ({ signal }) => apiGet<WorkflowSummary[]>('/api/workflows', signal),
    staleTime: 60_000,
  })
}

/** Render every selected step; nothing executes. */
export function usePreviewWorkflow(workflowId: string) {
  return useMutation({
    mutationKey: ['workflows', workflowId, 'preview'],
    mutationFn: (request: WorkflowRequest) =>
      apiPost<WorkflowPreviewResult, WorkflowRequest>(`/api/workflows/${encodeURIComponent(workflowId)}/preview`, request),
  })
}

/** Run the selected steps in order; stops at the first failure. */
export function useExecuteWorkflow(workflowId: string) {
  return useMutation({
    mutationKey: ['workflows', workflowId, 'execute'],
    mutationFn: (request: WorkflowRequest) =>
      apiPost<WorkflowExecuteResult, WorkflowRequest>(`/api/workflows/${encodeURIComponent(workflowId)}/execute`, request),
  })
}
