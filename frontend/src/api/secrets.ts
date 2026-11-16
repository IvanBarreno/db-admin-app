// secrets.ts — POST /api/secrets/password: a freshly generated password with the chosen options.
// A mutation (not a query) because every call returns a NEW value that must never be cached.

import { useMutation } from '@tanstack/react-query'
import { apiPost, type Schema } from './client'

export type GeneratePasswordRequest = Schema<'GeneratePasswordRequest'>
export type GeneratedPasswordResponse = Schema<'GeneratedPasswordResponse'>

export function useGeneratePassword() {
  return useMutation({
    mutationKey: ['secrets', 'password'],
    mutationFn: (request: GeneratePasswordRequest) =>
      apiPost<GeneratedPasswordResponse, GeneratePasswordRequest>('/api/secrets/password', request),
  })
}
