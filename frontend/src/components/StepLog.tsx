import { Accordion, Table, Text } from '@mantine/core'

/** One per-database outcome. Both the execute response and /api/audit/{id}/steps fit this shape. */
export interface StepRow {
  database?: string | null
  status: string
  rowCount?: number | null
  message?: string | null
}

const STATUS_COLOR: Record<string, string> = { ERROR: 'red', SKIPPED: 'yellow' }

/**
 * Summary line ("47 databases: 45 OK, 2 errors") with the per-database list expandable below.
 * Collapsed by default; it opens itself when anything failed so errors are never hidden.
 */
export function StepLog({ steps }: { steps: StepRow[] }) {
  if (steps.length === 0) return null

  const errors = steps.filter((s) => s.status === 'ERROR').length
  const skipped = steps.filter((s) => s.status === 'SKIPPED').length
  const ok = steps.length - errors - skipped

  const parts = [`${ok} OK`]
  if (skipped > 0) parts.push(`${skipped} skipped`)
  if (errors > 0) parts.push(`${errors} ${errors === 1 ? 'error' : 'errors'}`)

  return (
    // defaultValue opens the only item at the start; the page remounts this component per result, so a
    // result with errors is always open.
    <Accordion variant="contained" defaultValue={errors > 0 ? 'steps' : null}>
      <Accordion.Item value="steps">
        <Accordion.Control>
          <Text size="sm" fw={500}>
            {steps.length} {steps.length === 1 ? 'database' : 'databases'}: {parts.join(', ')}
          </Text>
        </Accordion.Control>
        <Accordion.Panel>
          <Table fz="xs" verticalSpacing={4} withRowBorders>
            <Table.Tbody>
              {steps.map((s, i) => (
                <Table.Tr key={i}>
                  <Table.Td ff="monospace">{s.database ?? '—'}</Table.Td>
                  <Table.Td c={STATUS_COLOR[s.status] ?? 'green'}>{s.status}</Table.Td>
                  <Table.Td c="dimmed">{s.rowCount ?? 0} rows</Table.Td>
                  <Table.Td>{s.message}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  )
}
