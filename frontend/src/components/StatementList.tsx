import { Code, Paper, Table, Text } from '@mantine/core'
import type { Schema } from '../api/client'

export type DryRunStatement = Schema<'DryRunStatement'>

/**
 * The exact statements a run will execute (dry run), one block per database for all-databases
 * operations. This is what the DBA confirms — not the template with `@login_name` placeholders.
 */
export function StatementList({ statements }: { statements: readonly DryRunStatement[] | null | undefined }) {
  if (!statements) return null
  if (statements.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Nothing to execute: the script found nothing to change.
      </Text>
    )
  }

  return (
    <Paper withBorder>
      <Text size="xs" fw={600} c="dimmed" px="sm" py={6} style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
        Statements that will run ({statements.length})
      </Text>
      <Table fz="xs" verticalSpacing={4} withRowBorders>
        <Table.Tbody>
          {statements.map((s, i) => (
            <Table.Tr key={i}>
              {s.database !== undefined && s.database !== null && (
                <Table.Td fw={500} c="dimmed" style={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                  {s.database}
                </Table.Td>
              )}
              <Table.Td>
                {/* block + pre-wrap: one statement per box, long lines wrap instead of scrolling sideways. */}
                <Code block style={{ whiteSpace: 'pre-wrap', background: 'transparent', padding: 0 }}>
                  {s.text}
                </Code>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Paper>
  )
}
