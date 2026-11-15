// lookupText.test.ts — which lookup items a parameter's `lock_when` rules lock, and what they wait for.

import { describe, expect, it } from 'vitest'
import type { LookupItem } from '../api/lookups'
import type { OperationParameter } from '../api/operations'
import { lockReason, lockWaitsFor } from './lookupText'

type Rule = NonNullable<OperationParameter['lockWhen']>[number]

const item = (extra: Record<string, unknown>) => ({ value: 'x', label: 'x', extra }) as unknown as LookupItem

const windowsRule: Rule = { column: 'type', values: ['SQL_LOGIN'], not: true, reason: 'managed by Windows', ifParam: null, ifValue: null }
const enabledRule: Rule = { column: 'is_disabled', values: ['false'], not: false, reason: 'already enabled', ifParam: 'action', ifValue: 'ENABLE' }

describe('lockReason', () => {
  it('locks an item whose column is NOT in the allowed list (not: true)', () => {
    expect(lockReason([windowsRule], item({ type: 'WINDOWS_LOGIN' }), {})).toBe('managed by Windows')
    expect(lockReason([windowsRule], item({ type: 'SQL_LOGIN' }), {})).toBeNull()
  })

  it('compares booleans as text and only while the other field has the wanted value', () => {
    const enabled = item({ is_disabled: false })
    expect(lockReason([enabledRule], enabled, { action: 'ENABLE' })).toBe('already enabled')
    expect(lockReason([enabledRule], enabled, { action: 'DISABLE' })).toBeNull()
    expect(lockReason([enabledRule], enabled, {})).toBeNull()
  })

  it('does not lock when the lookup has no such column (e.g. another engine)', () => {
    expect(lockReason([windowsRule], item({}), {})).toBeNull()
  })

  it('no rules, nothing locked', () => {
    expect(lockReason(undefined, item({ type: 'X' }), {})).toBeNull()
  })
})

describe('lockWaitsFor', () => {
  it('names the field a rule is waiting for while it is blank', () => {
    expect(lockWaitsFor([enabledRule], {})).toBe('action')
    expect(lockWaitsFor([enabledRule], { action: 'DISABLE' })).toBeNull()
    expect(lockWaitsFor([windowsRule], {})).toBeNull()
  })
})
