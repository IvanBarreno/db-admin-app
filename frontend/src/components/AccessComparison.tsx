import { Alert, Skeleton, Stack, Table, Text } from '@mantine/core'
import { useLookup } from '../api/lookups'
import { toAccess } from './accessDiff'

/**
 * Side-by-side preview of a clone ("Clone server access" / "Clone database access"): what the source holds,
 * what the target holds now, and what the target will hold afterwards (only ADDS or overrides; nothing is
 * removed). Rows that change are highlighted. It reads the same facts the operation reads, so it is a preview
 * of the result and the statements list stays the exact SQL. CONNECT is left out, as the operations skip it.
 *
 * Server level is the default (`server_access`, by login). For a database pass `lookupId="database_access"`,
 * `argName="user_name"` and the `database`.
 */
export function AccessComparison({
  serverName,
  source,
  target,
  includeRoles,
  includePermissions,
  lookupId = 'server_access',
  argName = 'login_name',
  database = '',
}: {
  serverName: string | null
  source: string
  target: string
  includeRoles: boolean
  includePermissions: boolean
  /** The lookup that lists what a principal holds, and the name of its argument. */
  lookupId?: string
  argName?: string
  /** Database for the database-level comparison. */
  database?: string
}) {
  const from = useLookup(source ? serverName : null, lookupId, { database, args: { [argName]: source } })
  const to = useLookup(target ? serverName : null, lookupId, { database, args: { [argName]: target } })

  if (!source || !target) {
    return (
      <Text size="xs" c="dimmed">
        Pick both to compare what each one holds and what the target will end up with.
      </Text>
    )
  }
  if (from.isPending || to.isPending) return <Skeleton height={48} />
  const failed = from.isError ? from.error.message : to.isError ? to.error.message : (from.data?.warning ?? to.data?.warning)
  if (failed) {
    return (
      <Alert color="yellow" variant="light" p="xs">
        Could not read their access for the comparison: {failed}
      </Alert>
    )
  }

  const sourceAccess = toAccess(from.data?.items)
  const targetAccess = toAccess(to.data?.items)

  const rows = [...new Set([...sourceAccess.keys(), ...targetAccess.keys()])].map((key) => {
    const s = sourceAccess.get(key)
    const t = targetAccess.get(key)
    const kind = (s ?? t)!.kind
    const copied = kind === 'ROLE' ? includeRoles : includePermissions
    // Roles are only added. A permission the source holds is applied as the source has it (a DENY overrides a GRANT).
    const after = s && copied ? s.state : t?.state
    return { key, kind, item: (s ?? t)!.item, source: s?.state, now: t?.state, after, changes: after !== t?.state }
  })
  rows.sort((a, b) => a.kind.localeCompare(b.kind) || a.item.localeCompare(b.item))

  const changing = rows.filter((r) => r.changes).length

  return (
    <Stack gap={4}>
      <Text size="xs">
        {changing === 0
          ? 'Nothing to copy: the target already has everything the source has.'
          : `${changing} change${changing === 1 ? '' : 's'} to [${target}]; nothing is removed.`}
      </Text>
      <Table.ScrollContainer minWidth={420} maxHeight={320} type="native">
        <Table stickyHeader withTableBorder fz="xs" verticalSpacing={3}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Type</Table.Th>
              <Table.Th>Item</Table.Th>
              <Table.Th>[{source}] (source)</Table.Th>
              <Table.Th>[{target}] now</Table.Th>
              <Table.Th>[{target}] after</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5} c="dimmed">
                  Neither holds any roles or explicit permissions.
                </Table.Td>
              </Table.Tr>
            )}
            {rows.map((r) => (
              // "light-green" tint behind rows that change, in both colour schemes.
              <Table.Tr key={r.key} bg={r.changes ? 'var(--mantine-color-green-light)' : undefined}>
                <Table.Td c="dimmed">{r.kind === 'ROLE' ? 'Role' : 'Permission'}</Table.Td>
                <Table.Td ff="monospace">{r.item}</Table.Td>
                <Table.Td>{r.source ?? '—'}</Table.Td>
                <Table.Td>{r.now ?? '—'}</Table.Td>
                <Table.Td fw={r.changes ? 600 : undefined} c={r.changes ? 'green' : undefined}>
                  {r.after ?? '—'}
                  {r.changes && ' ← new'}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Stack>
  )
}
