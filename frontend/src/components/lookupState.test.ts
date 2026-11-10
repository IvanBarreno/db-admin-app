// lookupState.test.ts — the reasons a lookup-driven field gives when it cannot show a list.
// useLookup (React Query) is replaced by a stub so each server answer can be played back exactly.

import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { humanize, useLookupState } from './lookupState'

const useLookup = vi.fn()
vi.mock('../api/lookups', () => ({ useLookup: (...args: unknown[]) => useLookup(...args) }))

const refetch = vi.fn()

/** What React Query would return for a finished request. */
function answer(data: unknown) {
  useLookup.mockReturnValue({ isPending: false, isError: false, data, refetch })
}

function failure(error: Error) {
  useLookup.mockReturnValue({ isPending: false, isError: true, error, refetch })
}

const item = { value: 'alice', label: 'alice', extra: {} }

beforeEach(() => {
  useLookup.mockReset()
  refetch.mockReset()
  useLookup.mockReturnValue({ isPending: true, isError: false, refetch })
})

describe('humanize', () => {
  it('drops _name and turns underscores into spaces', () => {
    expect(humanize('login_name')).toBe('login')
    expect(humanize('roles_to_add')).toBe('roles to add')
  })
})

describe('useLookupState', () => {
  it('is idle without a server and does not ask for the list', () => {
    const { result } = renderHook(() => useLookupState(null, 'logins'))

    expect(result.current.status).toBe('idle')
    expect(result.current.reason).toBe('Select a server first.')
    expect(useLookup).toHaveBeenCalledWith(null, 'logins', expect.anything())
  })

  it('waits for the fields the list depends on', () => {
    const { result } = renderHook(() => useLookupState('SRV', 'server_roles', { args: { login_name: '' } }))

    expect(result.current.status).toBe('waiting')
    expect(result.current.reason).toBe('Choose the login first.')
    expect(useLookup).toHaveBeenCalledWith(null, 'server_roles', expect.anything())
  })

  it('is loading while the request is pending', () => {
    const { result } = renderHook(() => useLookupState('SRV', 'logins'))

    expect(result.current.status).toBe('loading')
    expect(result.current.reason).toBeNull()
  })

  it('is ready with the items when the server returned some', () => {
    answer({ items: [item], warning: null, reason: null, requires: null, emptyText: null })

    const { result } = renderHook(() => useLookupState('SRV', 'logins'))

    expect(result.current.status).toBe('ready')
    expect(result.current.items).toEqual([item])
    expect(result.current.reason).toBeNull()
  })

  it('is empty with the lookup’s own empty text', () => {
    answer({ items: [], warning: null, reason: null, requires: null, emptyText: 'No orphaned users here.' })

    const { result } = renderHook(() => useLookupState('SRV', 'orphans'))

    expect(result.current.status).toBe('empty')
    expect(result.current.reason).toBe('No orphaned users here.')
  })

  it('is empty with a default text when the lookup gives none', () => {
    answer({ items: [], warning: null, reason: null, requires: null, emptyText: null })

    const { result } = renderHook(() => useLookupState('SRV', 'orphans'))

    expect(result.current.reason).toBe('Nothing to list on this server.')
  })

  it('names the missing permission and offers no retry', () => {
    answer({ items: [], warning: 'denied', reason: 'permission', requires: 'VIEW ANY DEFINITION', emptyText: null })

    const { result } = renderHook(() => useLookupState('SRV', 'logins'))

    expect(result.current.status).toBe('unavailable')
    expect(result.current.reason).toContain('VIEW ANY DEFINITION')
    expect(result.current.retryable).toBe(false)
  })

  it('reports a failed lookup with the warning and a retry', () => {
    answer({ items: [], warning: 'timeout', reason: 'failed', requires: null, emptyText: null })

    const { result } = renderHook(() => useLookupState('SRV', 'logins'))

    expect(result.current.status).toBe('unavailable')
    expect(result.current.reason).toBe('Could not load the list: timeout')
    expect(result.current.retryable).toBe(true)

    result.current.retry()
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('treats 404 as not available for this engine', () => {
    failure(new ApiError(404, undefined))

    const { result } = renderHook(() => useLookupState('SRV', 'jobs'))

    expect(result.current.status).toBe('unavailable')
    expect(result.current.reason).toContain('Not available for this server')
    expect(result.current.retryable).toBe(false)
  })

  it('treats 400 without a database as "select a database first"', () => {
    failure(new ApiError(400, undefined))

    const { result } = renderHook(() => useLookupState('SRV', 'users'))

    expect(result.current.status).toBe('waiting')
    expect(result.current.reason).toBe('Select a database first.')
  })

  it('treats 400 WITH a database as a real, retryable failure', () => {
    failure(new ApiError(400, undefined))

    const { result } = renderHook(() => useLookupState('SRV', 'users', { database: 'Sales' }))

    expect(result.current.status).toBe('unavailable')
    expect(result.current.retryable).toBe(true)
  })

  it('treats other errors as retryable failures', () => {
    failure(new ApiError(500, undefined))

    const { result } = renderHook(() => useLookupState('SRV', 'logins'))

    expect(result.current.status).toBe('unavailable')
    expect(result.current.reason).toBe('Could not load the list: HTTP 500')
    expect(result.current.retryable).toBe(true)
  })
})
