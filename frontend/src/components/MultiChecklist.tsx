import { Anchor, Checkbox, Group, Paper, ScrollArea, Stack, Text, TextInput } from '@mantine/core'
import { useEffect, useState } from 'react'
import type { OperationParameter } from '../api/operations'
import type { LookupItem } from '../api/lookups'
import { fieldLabel } from './fieldKit'
import { LookupNotice } from './LookupNotice'
import { NONE, encodeList, lockReason, lockWaitsFor, lookupHint, parseList } from './lookupText'
import { humanize, useLookupState, type BlockReporter } from './lookupState'

/**
 * A list parameter shown as a checklist fed by a server-side lookup (sessions, jobs, databases, logins...).
 *
 * `defaultAll` lists start with everything ticked and an EMPTY value ("all"): the DBA only unticks what
 * should be left alone. Unticking everything is sent as "(none)", never as an empty list, so "nothing"
 * can never be read as "all". Other lists start empty.
 *
 * A list that cannot be loaded is not offered: the box says why (nothing exists, no permission, not available
 * for this engine, choose something first). A REQUIRED list in that state also blocks the form.
 * Protected logins (the account the app connects with) are shown locked, unless the operation only reads.
 */
export function MultiChecklist({
  param,
  value,
  onChange,
  serverName,
  database,
  values,
  allowProtected,
  onBlock,
}: {
  param: OperationParameter
  value: string
  onChange: (value: string) => void
  serverName: string | null
  database: string
  values: Record<string, string>
  /** True for read-only operations (audits), which may look at protected logins. */
  allowProtected: boolean
  onBlock?: BlockReporter
}) {
  const [filter, setFilter] = useState('')

  const args: Record<string, string> = {}
  for (const name of param.dependsOn ?? []) args[name] = values[name] ?? ''

  const state = useLookupState(serverName, param.effectiveSource ?? null, { database, args })
  const items = state.items
  // A rule that depends on another field (the action) cannot be applied until that field is chosen.
  const waitsFor = lockWaitsFor(param.lockWhen, values)
  const usable = state.status === 'ready' && waitsFor === null

  // An item is locked when it is a protected login, or when a `lock_when` rule of the parameter says so
  // (offline database, login already in the wanted state...). The reason is shown beside it.
  const lockedBy = (item: LookupItem): string | undefined => {
    const e = item.extra as Record<string, unknown>
    if (!allowProtected && param.protect !== false && e.is_protected === true) return `view only — ${String(e.protected_reason ?? 'protected')}`
    return lockReason(param.lockWhen, item, values) ?? undefined
  }
  const selectable = items.filter((i) => !lockedBy(i))

  // Tell the form when a REQUIRED list has nothing to choose from.
  const blocking = param.required
    ? waitsFor
      ? `Choose the ${humanize(waitsFor)} first.`
      : state.status !== 'ready' && state.status !== 'loading'
        ? (state.reason ?? 'Nothing to choose from.')
        : null
    : null
  useEffect(() => {
    onBlock?.(param.name, blocking)
    return () => onBlock?.(param.name, null)
  }, [onBlock, param.name, blocking])

  const allValues = selectable.map((i) => i.value)
  const explicit = parseList(value)
  const selected = new Set(param.defaultAll && value === '' ? allValues : explicit.filter((v) => allValues.includes(v)))

  // A tick that became locked (the action changed, so a login is now "already in that state") must not be sent.
  const stale = usable && explicit.some((v) => v !== NONE && !allValues.includes(v))
  useEffect(() => {
    if (stale) commit(new Set(explicit.filter((v) => allValues.includes(v))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stale, value])

  function commit(next: Set<string>) {
    const picked = allValues.filter((v) => next.has(v)) // list order, ignoring anything the server no longer lists
    if (param.defaultAll) {
      if (picked.length === allValues.length) onChange('') // everything = "all"
      else if (picked.length === 0) onChange(JSON.stringify([NONE]))
      else onChange(encodeList(picked))
    } else {
      onChange(encodeList(picked))
    }
  }

  function toggle(itemValue: string) {
    const next = new Set(selected)
    if (next.has(itemValue)) next.delete(itemValue)
    else next.add(itemValue)
    commit(next)
  }

  const shown = items.filter((i) => `${i.value} ${lookupHint(i)}`.toLowerCase().includes(filter.toLowerCase()))
  const count = [...selected].filter((v) => allValues.includes(v)).length

  return (
    // Paper = a surface with a border; the checklist reads as one boxed control.
    <Paper withBorder>
      <Group gap="sm" px="sm" py={6} wrap="wrap" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
        <Text size="sm" fw={500}>
          {fieldLabel(param)}
          {param.required && (
            <Text span c="red">
              {' '}
              *
            </Text>
          )}
        </Text>
        {usable && (
          <>
            <Text size="xs" c="dimmed">
              {count} of {selectable.length} selected
              {param.defaultAll && value === '' && ' (all)'}
            </Text>
            <Anchor component="button" type="button" size="xs" onClick={() => commit(new Set(allValues))}>
              All
            </Anchor>
            <Anchor component="button" type="button" size="xs" onClick={() => commit(new Set())}>
              None
            </Anchor>
            {items.length > 8 && (
              <TextInput
                size="xs"
                ml="auto"
                w={160}
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.currentTarget.value)}
                placeholder="filter…"
                aria-label={`Filter ${fieldLabel(param)}`}
              />
            )}
          </>
        )}
      </Group>

      {param.help && (
        <Text size="xs" c="dimmed" px="sm" pt={4}>
          {param.help}
        </Text>
      )}

      <ScrollArea.Autosize mah={220} type="auto">
        <Stack gap={4} px="sm" py={6}>
          {waitsFor !== null && (
            <Text size="sm" c="dimmed">
              Choose the {humanize(waitsFor)} first: this list then shows only what it can change.
            </Text>
          )}

          {waitsFor === null && state.status === 'loading' && (
            <Text size="sm" c="dimmed">
              Loading…
            </Text>
          )}

          {waitsFor === null && state.status !== 'ready' && state.status !== 'loading' && <LookupNotice state={state} />}

          {usable &&
            shown.map((item) => {
              const lock = lockedBy(item)
              const description = (item.extra as Record<string, unknown>).description
              return (
                <Checkbox
                  key={item.value}
                  size="xs"
                  checked={!lock && selected.has(item.value)}
                  disabled={lock !== undefined}
                  onChange={() => toggle(item.value)}
                  title={lock ?? (typeof description === 'string' ? description : undefined)}
                  label={
                    <Group gap="xs" wrap="nowrap">
                      <Text size="xs" ff="monospace">
                        {item.value}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {lock ? `🔒 ${lock}` : lookupHint(item)}
                      </Text>
                    </Group>
                  }
                />
              )
            })}
        </Stack>
      </ScrollArea.Autosize>
    </Paper>
  )
}
