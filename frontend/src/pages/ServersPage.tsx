import { Alert, Anchor, Badge, Button, Card, Code, Group, Skeleton, SimpleGrid, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconPlugConnected } from '@tabler/icons-react'
import { EnvBadge } from '../components/EnvBadge'
import { PageHeader } from '../shell/PageHeader'
import { useServers, useTestConnection, type ServerSummary } from '../api/servers'

/** Lists every configured server with a "Test connection" button per card. */
export default function ServersPage() {
  const servers = useServers()

  return (
    <Stack gap="md">
      <PageHeader
        title="Servers"
        description="Defined in servers.json (shared) and servers.local.json (personal). Restart the API after editing."
      />

      {servers.isPending && (
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <Skeleton height={190} />
          <Skeleton height={190} />
        </SimpleGrid>
      )}
      {servers.isError && (
        <Alert color="red" variant="light">
          Could not load servers: {servers.error.message}
        </Alert>
      )}

      {servers.data && (
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          {servers.data.map((s) => (
            <ServerCard key={s.name} server={s} />
          ))}
        </SimpleGrid>
      )}
    </Stack>
  )
}

function ServerCard({ server }: { server: ServerSummary }) {
  const test = useTestConnection(server.name)

  return (
    <Card withBorder padding="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Text fw={600}>{server.name}</Text>
          <Text size="sm" c="dimmed">
            {server.host}
            {server.port ? `,${server.port}` : ''}
            {server.defaultDatabase ? ` · ${server.defaultDatabase}` : ''}
          </Text>
        </div>
        <EnvBadge environment={server.environment} />
      </Group>

      <Stack gap={2} mt="sm" fz="sm">
        <Fact label="Engine" value={server.engineDisplayName} />
        <Fact label="Auth" value={server.auth} />
        {server.tags.length > 0 && (
          <Group gap={4}>
            <Text c="dimmed" w={72}>
              Tags
            </Text>
            {server.tags.map((tag) => (
              <Badge key={tag} size="sm" variant="outline" color="gray">
                {tag}
              </Badge>
            ))}
          </Group>
        )}
      </Stack>

      <Group mt="md" gap="sm">
        <Button
          leftSection={<IconPlugConnected size={16} />}
          loading={test.isPending}
          onClick={() =>
            test.mutate(undefined, {
              onSuccess: (result) =>
                notifications.show(
                  result.success
                    ? { color: 'green', title: server.name, message: `Connected in ${result.elapsedMs} ms` }
                    : { color: 'red', title: server.name, message: 'Connection failed. Details are on the card.' },
                ),
            })
          }
        >
          Test connection
        </Button>
        {test.isError && (
          <Text size="sm" c="red">
            {test.error.message}
          </Text>
        )}
      </Group>

      {test.data && <TestResult result={test.data} />}
    </Card>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Group gap="xs" wrap="nowrap">
      <Text c="dimmed" w={72}>
        {label}
      </Text>
      <Text span>{value}</Text>
    </Group>
  )
}

function TestResult({ result }: { result: NonNullable<ReturnType<typeof useTestConnection>['data']> }) {
  if (!result.success || !result.info) {
    return (
      <Alert color="red" variant="light" mt="sm" title={`Connection failed (${result.elapsedMs} ms)`}>
        <Text size="sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {result.error}
        </Text>
        <Text size="xs" c="dimmed" mt={6}>
          A serverless Azure database may need a second try while it wakes up.{' '}
          <Anchor size="xs" href="https://learn.microsoft.com/azure/azure-sql/database/serverless-tier-overview" target="_blank" rel="noreferrer">
            Why?
          </Anchor>
        </Text>
      </Alert>
    )
  }

  const i = result.info
  return (
    <Alert color="green" variant="light" mt="sm" title={`Connected in ${result.elapsedMs} ms`}>
      <Stack gap={2} fz="sm">
        <Fact label="Server" value={i.serverName} />
        <Fact label="Version" value={`${i.version} · ${i.edition}`} />
        <Fact label="Login" value={`${i.loginName}${i.isSysAdmin ? ' (sysadmin)' : ''}`} />
        <Group gap="xs" wrap="nowrap">
          <Text c="dimmed" w={72}>
            Database
          </Text>
          <Code>{i.currentDatabase}</Code>
        </Group>
      </Stack>
    </Alert>
  )
}
