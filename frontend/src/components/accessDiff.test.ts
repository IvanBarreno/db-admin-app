// accessDiff.test.ts — the comparison of what two principals hold.

import { describe, expect, it } from 'vitest'
import type { LookupItem } from '../api/lookups'
import { compareAccess, toAccess } from './accessDiff'

const row = (kind: 'ROLE' | 'PERMISSION', item: string, state: string) =>
  ({ value: `${kind}:${item}`, label: item, extra: { kind, item, state } }) as unknown as LookupItem

describe('toAccess', () => {
  it('keys the rows by their lookup value', () => {
    const access = toAccess([row('ROLE', 'sysadmin', 'MEMBER')])

    expect(access.get('ROLE:sysadmin')).toEqual({ kind: 'ROLE', item: 'sysadmin', state: 'MEMBER' })
    expect(toAccess(undefined).size).toBe(0)
  })
})

describe('compareAccess', () => {
  const left = toAccess([row('ROLE', 'dbcreator', 'MEMBER'), row('PERMISSION', 'VIEW SERVER STATE', 'GRANT'), row('PERMISSION', 'ALTER TRACE', 'GRANT')])
  const right = toAccess([row('ROLE', 'dbcreator', 'MEMBER'), row('ROLE', 'sysadmin', 'MEMBER'), row('PERMISSION', 'ALTER TRACE', 'DENY')])

  it('lists everything either side holds, roles first, then by name', () => {
    expect(compareAccess(left, right).map((r) => r.key)).toEqual([
      'ROLE:dbcreator',
      'ROLE:sysadmin',
      'PERMISSION:ALTER TRACE',
      'PERMISSION:VIEW SERVER STATE',
    ])
  })

  it('marks a row as different when one side lacks it or the states differ', () => {
    const byKey = Object.fromEntries(compareAccess(left, right).map((r) => [r.key, r]))

    expect(byKey['ROLE:dbcreator'].differs).toBe(false)
    expect(byKey['ROLE:sysadmin']).toMatchObject({ left: undefined, right: 'MEMBER', differs: true })
    expect(byKey['PERMISSION:VIEW SERVER STATE']).toMatchObject({ left: 'GRANT', right: undefined, differs: true })
    expect(byKey['PERMISSION:ALTER TRACE']).toMatchObject({ left: 'GRANT', right: 'DENY', differs: true }) // same permission, opposite effect
  })

  it('finds no differences between identical sets and nothing at all between two empty ones', () => {
    expect(compareAccess(left, left).every((r) => !r.differs)).toBe(true)
    expect(compareAccess(new Map(), new Map())).toEqual([])
  })
})
