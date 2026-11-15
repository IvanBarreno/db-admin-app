// useInOperation.test.ts — which operations a row of an Explorer table can be sent to, and the link format.

import { describe, expect, it } from 'vitest'
import type { OperationSummary } from '../api/operations'
import { operationLink, operationsFor, readOperationLink } from './useInOperation'

/** Just enough of an operation for these rules: an id and parameters with their lookup. */
function op(id: string, ...params: { name: string; effectiveSource?: string; multi?: boolean; checklistGroup?: string }[]) {
  return { id, name: id, params } as unknown as OperationSummary
}

const catalog = [
  op('audit.login_status', { name: 'login_name', effectiveSource: 'logins' }),
  op('offboarding.reassign_jobs', { name: 'login_name', effectiveSource: 'logins' }, { name: 'new_owner', effectiveSource: 'logins' }),
  op('changes.set_logins_enabled', { name: 'logins', effectiveSource: 'logins', multi: true }),
  op('changes.database_roles', { name: 'user_name', effectiveSource: 'users' }, { name: 'roles_to_add', effectiveSource: 'database_roles', multi: true, checklistGroup: 'roles' }),
  op('audit.sysadmin_members'),
]

describe('operationsFor', () => {
  it('offers the operations with a single-value parameter fed by the same lookup', () => {
    const targets = operationsFor(catalog, 'logins')

    expect(targets.map((t) => t.operation.id)).toEqual(['audit.login_status', 'offboarding.reassign_jobs'])
  })

  it('fills the FIRST matching parameter (the login acted on, not the new owner)', () => {
    const jobs = operationsFor(catalog, 'logins').find((t) => t.operation.id === 'offboarding.reassign_jobs')

    expect(jobs?.param.name).toBe('login_name')
  })

  it('leaves out lists and role checklists: those are ticked on the Operations page', () => {
    expect(operationsFor(catalog, 'logins').map((t) => t.operation.id)).not.toContain('changes.set_logins_enabled')
    expect(operationsFor(catalog, 'database_roles')).toEqual([])
  })

  it('treats the richer Explorer tables as their picker lookup', () => {
    expect(operationsFor(catalog, 'sysadmins').map((t) => t.operation.id)).toContain('audit.login_status')
  })

  it('offers nothing for a table no operation takes items from', () => {
    expect(operationsFor(catalog, 'linked_servers')).toEqual([])
  })
})

describe('operationLink / readOperationLink', () => {
  it('round-trips server, database, operation and the prefilled parameter', () => {
    const link = operationLink('IB_LocalSQL', 'zz_lab_sales', 'changes.database_roles', 'user_name', 'DOM\\bob & co')

    expect(link.startsWith('/operations?')).toBe(true)
    expect(readOperationLink(new URLSearchParams(link.split('?')[1]))).toEqual({
      serverName: 'IB_LocalSQL',
      database: 'zz_lab_sales',
      operationId: 'changes.database_roles',
      params: { user_name: 'DOM\\bob & co' },
    })
  })

  it('omits the database for server-level tables', () => {
    expect(operationLink('S', '', 'audit.login_status', 'login_name', 'alice')).not.toContain('database=')
  })

  it('reads a plain /operations as "nothing chosen"', () => {
    expect(readOperationLink(new URLSearchParams(''))).toEqual({ serverName: null, database: '', operationId: null, params: {} })
  })
})
