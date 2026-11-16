import { Alert, Button, Code, Group, Stack, Table, Tabs, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconAlertCircle, IconDownload } from '@tabler/icons-react'
import { useState } from 'react'
import { downloadCsv, fileSlug, toCsv } from './csv'

/** Shape shared by CustomSqlResult and OperationExecuteResult — anything ResultsGrid can render. */
export interface ScriptRunResult {
  success: boolean
  resultSets: readonly {
    batchIndex: number
    columns: readonly string[]
    rows: readonly (readonly unknown[])[]
  }[]
  messages: readonly string[]
  failedBatchIndex?: number | null
  error?: string | null
}

/**
 * Renders every result set as a tab (batch #N) plus provider messages and the failure, if any.
 * `exportName` names the CSV file of the "Export CSV" button (e.g. the server and operation).
 */
export function ResultsGrid({ result, exportName = 'result' }: { result: ScriptRunResult; exportName?: string }) {
  const [activeTab, setActiveTab] = useState('0')
  const sets = result.resultSets
  // A new result can have fewer grids than the tab that was open: never index past the end.
  const shownIndex = Math.min(Number(activeTab), sets.length - 1)

  function exportCsv() {
    const set = sets[shownIndex]
    // Raw values, not the on-screen text: NULL becomes an empty field, dates keep their full precision.
    const suffix = sets.length > 1 ? `-${shownIndex + 1}` : ''
    downloadCsv(`${fileSlug(exportName)}${suffix}`, toCsv(set.columns, set.rows))
    notifications.show({ color: 'green', message: `CSV saved (${set.rows.length} rows)` })
  }

  return (
    <Stack gap="sm">
      {result.messages.length > 0 && (
        <Code block style={{ whiteSpace: 'pre-wrap' }}>
          {result.messages.join('\n')}
        </Code>
      )}

      {!result.success && (
        <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />} title={`Batch ${(result.failedBatchIndex ?? 0) + 1} failed`}>
          <Text size="sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {result.error}
          </Text>
        </Alert>
      )}

      {sets.length > 0 && (
        <Stack gap={6}>
          {sets.length > 1 && (
            <Tabs value={String(shownIndex)} onChange={(tab) => setActiveTab(tab ?? '0')}>
              <Tabs.List>
                {sets.map((s, i) => (
                  <Tabs.Tab key={i} value={String(i)}>
                    Result {i + 1} (batch {s.batchIndex + 1}) · {s.rows.length} row{s.rows.length === 1 ? '' : 's'}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs>
          )}
          <Group gap="sm">
            <Text size="xs" c="dimmed">
              {sets[shownIndex].rows.length} row{sets[shownIndex].rows.length === 1 ? '' : 's'}
            </Text>
            <Button
              ml="auto"
              size="compact-xs"
              variant="default"
              leftSection={<IconDownload size={14} />}
              onClick={exportCsv}
              disabled={sets[shownIndex].rows.length === 0}
            >
              Export CSV
            </Button>
          </Group>
          <ResultTable resultSet={sets[shownIndex]} />
        </Stack>
      )}

      {sets.length === 0 && result.success && (
        <Text size="sm" c="dimmed">
          Ran successfully. No result sets.
        </Text>
      )}
    </Stack>
  )
}

function ResultTable({ resultSet }: { resultSet: ScriptRunResult['resultSets'][number] }) {
  return (
    // Table.ScrollContainer: scrolls sideways inside its own box when there are many columns.
    // maxHeight + stickyHeader keep the column names on screen while the rows scroll.
    <Table.ScrollContainer minWidth={300} maxHeight={512} type="native">
      <Table stickyHeader highlightOnHover withTableBorder fz="sm" verticalSpacing={4}>
        <Table.Thead>
          <Table.Tr>
            {resultSet.columns.map((c, i) => (
              <Table.Th key={i} style={{ whiteSpace: 'nowrap' }}>
                {c}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {resultSet.rows.map((row, r) => (
            <Table.Tr key={r}>
              {row.map((cell, c) => (
                <Table.Td key={c} style={{ whiteSpace: 'nowrap' }}>
                  {cell === null ? (
                    <Text span c="dimmed" fs="italic" inherit>
                      NULL
                    </Text>
                  ) : (
                    String(cell)
                  )}
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}
