import { Alert, Button, Checkbox, Group, Paper, Select, Skeleton, Stack, Table, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconDownload } from '@tabler/icons-react'
import { useState } from 'react'
import { useLookup } from '../api/lookups'
import { useServers } from '../api/servers'
import { compareAccess, toAccess } from './accessDiff'
import { Combobox } from './Combobox'
import { downloadCsv, fileSlug, toCsv } from './csv'
import { lookupHint } from './lookupText'

/**
 * Permission diff (read-only): server roles and explicit server permissions of two logins, side by side.
 * The right side can be on ANOTHER server, which answers both classic questions:
 *   - "is this login set up the same on PROD and on DR?"  (same login, two servers)
 *   - "why can Ana do this and Luis cannot?"               (two logins, one server)
 * It uses the same `server_access` lookup as "Clone server access", so both always agree.
 */
export function LoginDiff({ serverName }: { serverName: string }) {
  const servers = useServers()
  const [leftLogin, setLeftLogin] = useState('')
  // Blank = "the same server as the left side"; it follows the page's server picker until the DBA chooses another.
  const [otherServer, setOtherServer] = useState('')
  const [rightLogin, setRightLogin] = useState('')
  const [onlyDifferences, setOnlyDifferences] = useState(false)

  const rightServer = otherServer || serverName

  const leftLogins = useLookup(serverName, 'logins')
  const rightLogins = useLookup(rightServer, 'logins')
  const left = useLookup(leftLogin ? serverName : null, 'server_access', { args: { login_name: leftLogin } })
  const right = useLookup(rightLogin ? rightServer : null, 'server_access', { args: { login_name: rightLogin } })

  const ready = leftLogin !== '' && rightLogin !== ''
  const failed = left.isError ? left.error.message : right.isError ? right.error.message : (left.data?.warning ?? right.data?.warning)

  const rows = ready && left.data && right.data ? compareAccess(toAccess(left.data.items), toAccess(right.data.items)) : []
  const different = rows.filter((r) => r.differs).length
  const shown = onlyDifferences ? rows.filter((r) => r.differs) : rows

  const leftTitle = `[${leftLogin}] on ${serverName}`
  const rightTitle = `[${rightLogin}] on ${rightServer}`

  function exportCsv() {
    downloadCsv(
      fileSlug(`diff ${leftLogin} ${serverName} vs ${rightLogin} ${rightServer}`),
      toCsv(['type', 'item', leftTitle, rightTitle, 'differs'], shown.map((r) => [r.kind, r.item, r.left ?? '', r.right ?? '', r.differs ? 'yes' : 'no'])),
    )
    notifications.show({ color: 'green', message: `CSV saved (${shown.length} rows)` })
  }

  return (
    <Stack gap="md">
      <Group align="flex-end" gap="sm" wrap="wrap">
        <Combobox
          label={`Login on ${serverName}`}
          value={leftLogin}
          onChange={setLeftLogin}
          items={(leftLogins.data?.items ?? []).map((i) => ({ value: i.value, hint: lookupHint(i) }))}
          placeholder={leftLogins.isPending ? 'loading…' : 'pick a login'}
          w={256}
        />

        <Text c="dimmed" pb={8}>
          compared with
        </Text>

        <Select
          label="Server"
          w={220}
          allowDeselect={false}
          data={(servers.data ?? []).map((s) => ({ value: s.name, label: s.name === serverName ? `${s.name} (same server)` : s.name }))}
          value={rightServer}
          onChange={(next) => {
            setOtherServer(next === null || next === serverName ? '' : next)
            setRightLogin('') // logins belong to a server: start again
          }}
        />

        <Combobox
          label={`Login on ${rightServer}`}
          value={rightLogin}
          onChange={setRightLogin}
          items={(rightLogins.data?.items ?? []).map((i) => ({ value: i.value, hint: lookupHint(i) }))}
          placeholder={rightLogins.isPending ? 'loading…' : 'pick a login'}
          w={256}
        />

        {/* The usual "same login, other server" case in one click. */}
        {otherServer !== '' && leftLogin !== '' && rightLogin !== leftLogin && (
          <Button variant="subtle" size="compact-sm" mb={4} onClick={() => setRightLogin(leftLogin)}>
            use [{leftLogin}]
          </Button>
        )}
      </Group>

      {!ready && (
        <Text c="dimmed" size="sm">
          Pick both logins to compare their server roles and explicit server permissions.
        </Text>
      )}
      {ready && (left.isPending || right.isPending) && <Skeleton height={64} />}
      {ready && failed && (
        <Alert color="yellow" variant="light">
          Could not read their access: {failed}
        </Alert>
      )}

      {ready && !failed && left.data && right.data && (
        <Paper withBorder>
          <Group gap="sm" px="sm" py={8} wrap="wrap" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
            <Text size="sm" fw={600} c={different === 0 ? 'green' : 'orange'}>
              {rows.length === 0
                ? 'Neither holds any server roles or explicit server permissions.'
                : different === 0
                  ? `Identical: ${rows.length} item${rows.length === 1 ? '' : 's'}, no differences.`
                  : `${different} difference${different === 1 ? '' : 's'} in ${rows.length} item${rows.length === 1 ? '' : 's'}.`}
            </Text>
            <Checkbox size="xs" label="only differences" checked={onlyDifferences} onChange={(e) => setOnlyDifferences(e.currentTarget.checked)} />
            <Button ml="auto" size="compact-xs" variant="default" leftSection={<IconDownload size={14} />} onClick={exportCsv} disabled={shown.length === 0}>
              Export CSV
            </Button>
          </Group>
          {shown.length > 0 && (
            <Table.ScrollContainer minWidth={480} maxHeight={448} type="native">
              <Table stickyHeader fz="xs" verticalSpacing={4}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Type</Table.Th>
                    <Table.Th>Item</Table.Th>
                    <Table.Th>{leftTitle}</Table.Th>
                    <Table.Th>{rightTitle}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {shown.map((r) => (
                    <Table.Tr key={r.key} bg={r.differs ? 'var(--mantine-color-yellow-light)' : undefined}>
                      <Table.Td c="dimmed">{r.kind === 'ROLE' ? 'Role' : 'Permission'}</Table.Td>
                      <Table.Td ff="monospace">{r.item}</Table.Td>
                      <Table.Td c={r.left ? undefined : 'dimmed'}>{r.left ?? '— not held'}</Table.Td>
                      <Table.Td c={r.right ? undefined : 'dimmed'}>{r.right ?? '— not held'}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Paper>
      )}

      <Text size="xs" c="dimmed">
        Server level only (CONNECT SQL is left out). To copy what is missing, use <em>Clone server access</em> on the Operations page.
      </Text>
    </Stack>
  )
}
