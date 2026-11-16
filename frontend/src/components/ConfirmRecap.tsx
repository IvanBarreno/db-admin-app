import { Table } from '@mantine/core'

/**
 * Recap table inside the confirm dialog: the few facts that must be right before pressing the
 * button — server, where, who, what, how much. Rows with an empty value are skipped.
 */
export function ConfirmRecap({ rows }: { rows: readonly (readonly [label: string, value: string | null | undefined])[] }) {
  const shown = rows.filter(([, value]) => value)

  return (
    // withRowBorders: a thin line between facts; Table.Th as the first cell makes each row "label: value".
    <Table withRowBorders verticalSpacing={4} fz="sm">
      <Table.Tbody>
        {shown.map(([label, value]) => (
          <Table.Tr key={label}>
            <Table.Th w={120} fw={600}>
              {label}
            </Table.Th>
            <Table.Td>{value}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  )
}
