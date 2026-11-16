import { Alert, Badge, Button, Code, Drawer, Group, Paper, Select, Skeleton, Stack, Table, Text, TextInput, Tooltip } from '@mantine/core'
import { useState } from 'react'
import { useAuditLog, useAuditSteps, type AuditEntry } from '../api/audit'
import { useServers } from '../api/servers'
import { StepLog } from '../components/StepLog'
import { PageHeader } from '../shell/PageHeader'

/**
 * Does the drawer have anything the row does not already show? Steps, an error message or parameters.
 * (The SQL alone does not count: the row shows it, and its full text is in the cell's tooltip.)
 */
function hasDetails(entry: AuditEntry): boolean {
  return entry.stepCount > 0 || Boolean(entry.detail) || Boolean(entry.parametersJson)
}

/** Details of one run, opened from its row: the full SQL, the parameters, and the per-database steps (loaded now, not before). */
function EntryDetails({ entry }: { entry: AuditEntry }) {
  // The list already says how many steps the run has: only ask for them when there are any.
  const hasSteps = entry.stepCount > 0
  const steps = useAuditSteps(entry.id, hasSteps)

  return (
    <Stack gap="md">
      <Group gap="xs">
        <Badge color={entry.status === 'Success' ? 'green' : 'red'} variant="light">
          {entry.status}
        </Badge>
        <Text size="sm" c="dimmed">
          {new Date(entry.executedAtUtc).toLocaleString()} · {entry.executedBy} · {entry.serverName}
          {entry.database ? ` · ${entry.database}` : ''}
        </Text>
      </Group>

      {entry.detail && (
        <Alert color="red" variant="light">
          {entry.detail}
        </Alert>
      )}

      <div>
        <Text size="sm" fw={600} mb={4}>
          SQL
        </Text>
        <Code block style={{ whiteSpace: 'pre-wrap' }}>
          {entry.sql}
        </Code>
      </div>

      {entry.parametersJson && (
        <div>
          <Text size="sm" fw={600} mb={4}>
            Parameters
          </Text>
          <Code block style={{ whiteSpace: 'pre-wrap' }}>
            {entry.parametersJson}
          </Code>
          <Text size="xs" c="dimmed" mt={4}>
            Passwords are recorded as ***.
          </Text>
        </div>
      )}

      {hasSteps && (
        <div>
          <Text size="sm" fw={600} mb={4}>
            Steps
          </Text>
          {steps.isPending && <Skeleton height={40} />}
          {steps.isError && <Text c="red">{steps.error.message}</Text>}
          {steps.data && <StepLog steps={steps.data} />}
        </div>
      )}
    </Stack>
  )
}

/** Audit Log page: filters by user, server, status, newest entries first. */
export default function AuditLogPage() {
  const servers = useServers()
  const [executedBy, setExecutedBy] = useState('')
  const [serverName, setServerName] = useState('')
  const [status, setStatus] = useState('')
  // The row whose details are open in the side drawer (null = closed).
  const [selected, setSelected] = useState<AuditEntry | null>(null)

  const audit = useAuditLog({
    executedBy: executedBy || undefined,
    serverName: serverName || undefined,
    status: status || undefined,
  })

  return (
    <Stack gap="md">
      <PageHeader title="Audit log" description="Every run on this machine, newest first. Open a row for the full SQL and its steps." />

      <Group align="flex-end" gap="sm">
        <TextInput label="User" placeholder="any" w={200} value={executedBy} onChange={(e) => setExecutedBy(e.currentTarget.value)} />
        <Select
          label="Server"
          placeholder="any"
          w={220}
          clearable
          data={(servers.data ?? []).map((s) => s.name)}
          value={serverName || null}
          onChange={(next) => setServerName(next ?? '')}
        />
        <Select
          label="Status"
          placeholder="any"
          w={160}
          clearable
          data={['Success', 'Failed']}
          value={status || null}
          onChange={(next) => setStatus(next ?? '')}
        />
      </Group>

      {audit.isPending && <Skeleton height={160} />}
      {audit.isError && (
        <Alert color="red" variant="light">
          Could not load audit log: {audit.error.message}
        </Alert>
      )}

      {audit.data && (
        <Paper withBorder>
          <Table.ScrollContainer minWidth={760} type="native">
            <Table highlightOnHover verticalSpacing={6} fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>When</Table.Th>
                  <Table.Th>User</Table.Th>
                  <Table.Th>Server</Table.Th>
                  <Table.Th>Database</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>SQL</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {audit.data.map((entry) => (
                  <Table.Tr key={entry.id}>
                    <Table.Td c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                      {new Date(entry.executedAtUtc).toLocaleString()}
                    </Table.Td>
                    <Table.Td>{entry.executedBy}</Table.Td>
                    <Table.Td>{entry.serverName}</Table.Td>
                    <Table.Td>{entry.database ?? '—'}</Table.Td>
                    <Table.Td>
                      <Badge color={entry.status === 'Success' ? 'green' : 'red'} variant="light">
                        {entry.status}
                      </Badge>
                    </Table.Td>
                    <Table.Td maw={420}>
                      <Text size="xs" ff="monospace" truncate title={entry.sql}>
                        {entry.sql}
                      </Text>
                      {entry.parametersJson && (
                        <Text size="xs" c="dimmed" truncate title={entry.parametersJson}>
                          {entry.parametersJson}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {/* Disabled when the drawer would add nothing to the row: no steps, no error text,
                          no parameters. The tooltip says so (a dead button with no reason looks broken). */}
                      <Tooltip label="Nothing more to show: no steps, error text or parameters" disabled={hasDetails(entry)}>
                        <Button
                          size="compact-xs"
                          variant="default"
                          disabled={!hasDetails(entry)}
                          onClick={() => setSelected(entry)}
                          // A disabled button ignores the mouse, so the tooltip would never open: let it through.
                          style={hasDetails(entry) ? undefined : { pointerEvents: 'all' }}
                        >
                          {entry.stepCount > 0 ? `Details · ${entry.stepCount} step${entry.stepCount === 1 ? '' : 's'}` : 'Details'}
                        </Button>
                      </Tooltip>
                    </Table.Td>
                  </Table.Tr>
                ))}
                {audit.data.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={7} ta="center" c="dimmed" py="lg">
                      No entries match these filters.
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}

      <Drawer opened={selected !== null} onClose={() => setSelected(null)} position="right" size="lg" title="Audit entry">
        {/* Mounted only while open, so the steps are fetched when the DBA asks for them. */}
        {selected && <EntryDetails entry={selected} />}
      </Drawer>
    </Stack>
  )
}
