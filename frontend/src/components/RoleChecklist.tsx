import { Badge, Checkbox, Group, Paper, ScrollArea, Stack, Text, TextInput } from '@mantine/core'
import { useState } from 'react'
import type { OperationParameter } from '../api/operations'
import { LookupNotice } from './LookupNotice'
import { encodeList, parseList } from './lookupText'
import { useLookupState } from './lookupState'

/**
 * Roles of one principal as a single checklist. The ticks start from the server's own membership
 * (the lookup's `is_member` column); the form sends only the DIFFERENCE, in two list parameters
 * (`add` and `drop`). So unticking a role the login has means "drop it", ticking one it lacks means
 * "add it", and leaving a role alone sends nothing — only drops need the destructive confirmation.
 * Each role shows what it allows (the server-side description) as muted text and a tooltip.
 */
export function RoleChecklist({
  addParam,
  dropParam,
  values,
  onChange,
  serverName,
  database,
}: {
  addParam: OperationParameter
  dropParam: OperationParameter
  values: Record<string, string>
  /** Receives both list parameters at once. */
  onChange: (patch: Record<string, string>) => void
  serverName: string | null
  database: string
}) {
  const [filter, setFilter] = useState('')

  const args: Record<string, string> = {}
  for (const name of addParam.dependsOn ?? []) args[name] = values[name] ?? ''

  const state = useLookupState(serverName, addParam.effectiveSource ?? null, { database, args })
  const items = state.items
  const usable = state.status === 'ready'

  const adds = new Set(parseList(values[addParam.name]))
  const drops = new Set(parseList(values[dropParam.name]))

  const isMember = (extra: unknown) => (extra as Record<string, unknown>).is_member === true
  const isTicked = (item: (typeof items)[number]) => (isMember(item.extra) ? !drops.has(item.value) : adds.has(item.value))

  function toggle(item: (typeof items)[number]) {
    const nextAdds = new Set(adds)
    const nextDrops = new Set(drops)
    if (isMember(item.extra)) {
      // A role the principal HAS: unticking drops it, re-ticking cancels the drop.
      if (nextDrops.has(item.value)) nextDrops.delete(item.value)
      else nextDrops.add(item.value)
    } else if (nextAdds.has(item.value)) {
      nextAdds.delete(item.value)
    } else {
      nextAdds.add(item.value)
    }
    onChange({
      [addParam.name]: encodeList([...nextAdds].sort()),
      [dropParam.name]: encodeList([...nextDrops].sort()),
    })
  }

  const shown = items.filter((i) => i.value.toLowerCase().includes(filter.toLowerCase()))
  const changes = adds.size + drops.size
  const summary =
    changes === 0
      ? 'No changes'
      : [adds.size > 0 && `ADD ${[...adds].sort().join(', ')}`, drops.size > 0 && `DROP ${[...drops].sort().join(', ')}`]
          .filter(Boolean)
          .join(' · ')

  return (
    <Paper withBorder>
      <Group gap="sm" px="sm" py={6} wrap="wrap" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
        <Text size="sm" fw={500} title="Tick a role to add the principal to it, untick one it has to remove it.">
          Roles
        </Text>
        {usable && (
          <Text size="xs" c={changes > 0 ? undefined : 'dimmed'} fw={changes > 0 ? 500 : undefined}>
            {summary}
          </Text>
        )}
        {usable && items.length > 12 && (
          <TextInput
            size="xs"
            ml="auto"
            w={160}
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.currentTarget.value)}
            placeholder="filter…"
            aria-label="Filter roles"
          />
        )}
      </Group>

      <ScrollArea.Autosize mah={260} type="auto">
        <Stack gap={4} px="sm" py={6}>
          {state.status === 'loading' && (
            <Text size="sm" c="dimmed">
              Loading roles…
            </Text>
          )}

          {state.status !== 'ready' && state.status !== 'loading' && (
            <LookupNotice state={state} suffix={state.status === 'waiting' ? 'Its current roles will be ticked.' : undefined} />
          )}

          {usable &&
            shown.map((item) => {
              const extra = item.extra as Record<string, unknown>
              const member = isMember(extra)
              const ticked = isTicked(item)
              const change = member && !ticked ? 'drop' : !member && ticked ? 'add' : null
              const description = typeof extra.description === 'string' ? extra.description : null
              return (
                <Checkbox
                  key={item.value}
                  size="xs"
                  checked={ticked}
                  onChange={() => toggle(item)}
                  title={description ?? undefined}
                  label={
                    <Group gap="xs" wrap="wrap" style={{ rowGap: 0 }}>
                      <Text size="xs" ff="monospace" c={change === 'drop' ? 'red' : undefined} td={change === 'drop' ? 'line-through' : undefined}>
                        {item.value}
                      </Text>
                      {extra.is_high_risk === true && (
                        <Badge size="xs" color="orange" variant="light">
                          ⚠ high risk
                        </Badge>
                      )}
                      {extra.is_fixed_role === false && (
                        <Badge size="xs" color="gray" variant="light">
                          custom
                        </Badge>
                      )}
                      {change === 'add' && (
                        <Badge size="xs" color="green" variant="light">
                          will add
                        </Badge>
                      )}
                      {change === 'drop' && (
                        <Badge size="xs" color="red" variant="light">
                          will drop
                        </Badge>
                      )}
                      {change === null && member && (
                        <Text size="xs" c="dimmed">
                          member
                        </Text>
                      )}
                      {description && (
                        <Text size="xs" c="dimmed">
                          — {description}
                        </Text>
                      )}
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
