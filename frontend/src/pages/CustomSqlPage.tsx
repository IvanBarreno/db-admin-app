import { Alert, Button, Group, Select, Skeleton, Stack, Text, Textarea } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconPlayerPlay } from '@tabler/icons-react'
import { useState } from 'react'
import { EnvBadge } from '../components/EnvBadge'
import { ResultsGrid } from '../components/ResultsGrid'
import { TargetBar } from '../components/TargetBar'
import { targetLabel } from '../components/target'
import { PageHeader } from '../shell/PageHeader'
import { useDatabases, useServers } from '../api/servers'
import { useRunCustomSql } from '../api/customSql'

/** Free-form SQL box: server + optional database picker, a text area, and Execute. */
export default function CustomSqlPage() {
  const servers = useServers()
  const [serverName, setServerName] = useState<string | null>(null)
  const [database, setDatabase] = useState<string>('')
  const [sql, setSql] = useState('')

  const databases = useDatabases(serverName)
  const run = useRunCustomSql()

  const server = servers.data?.find((s) => s.name === serverName)

  function execute() {
    if (!serverName || sql.trim() === '') return
    run.mutate(
      { serverName, database: database || null, sql },
      {
        onSuccess: (result) =>
          notifications.show(
            result.success
              ? { color: 'green', title: 'Script finished', message: `${result.elapsedMs} ms` }
              : { color: 'red', title: 'Script failed', message: result.error ?? 'See the details below.' },
          ),
        onError: (error) => notifications.show({ color: 'red', title: 'Could not run the script', message: error.message }),
      },
    )
  }

  return (
    <Stack gap="md">
      <PageHeader title="Custom SQL" description="Free-form T-SQL, unrestricted. Every run is recorded in the audit log with the full text." />

      <TargetBar server={server} where={database || server?.defaultDatabase || '(login default database)'} summary="Free-form SQL, unrestricted" />

      {servers.isPending && <Skeleton height={36} maw={320} />}
      {servers.isError && (
        <Alert color="red" variant="light">
          Could not load servers: {servers.error.message}
        </Alert>
      )}

      {servers.data && (
        <Group align="flex-end" gap="sm">
          <Select
            label="Server"
            placeholder="Select a server…"
            w={260}
            data={servers.data.map((s) => s.name)}
            value={serverName}
            onChange={(next) => {
              setServerName(next)
              setDatabase('')
            }}
          />
          <Select
            label="Database"
            placeholder={server?.defaultDatabase ?? '(login default)'}
            w={260}
            searchable
            clearable
            disabled={!serverName || databases.isPending}
            data={(databases.data ?? []).map((d) => d.name)}
            value={database || null}
            onChange={(next) => setDatabase(next ?? '')}
          />
          {server && (
            <div style={{ paddingBottom: 6 }}>
              <EnvBadge environment={server.environment} />
            </div>
          )}
        </Group>
      )}

      <Textarea
        aria-label="SQL to run"
        value={sql}
        onChange={(e) => setSql(e.currentTarget.value)}
        placeholder="SELECT ..."
        autosize
        minRows={12}
        maxRows={32}
        spellCheck={false}
        styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 'var(--mantine-font-size-sm)' } }}
      />

      <Group gap="sm">
        <Button leftSection={<IconPlayerPlay size={16} />} onClick={execute} loading={run.isPending} disabled={!serverName || sql.trim() === ''}>
          {targetLabel('Execute', server, database || null)}
        </Button>
        {run.data && (
          <Text size="sm" c="dimmed">
            {run.data.elapsedMs} ms
          </Text>
        )}
      </Group>
      {run.isError && (
        <Alert color="red" variant="light">
          {run.error.message}
        </Alert>
      )}

      {run.data && <ResultsGrid result={run.data} exportName={`${serverName} custom sql`} />}
    </Stack>
  )
}
