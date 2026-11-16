import { Alert, Button, Group, Menu, Select, Skeleton, Stack, Tabs, Text } from '@mantine/core'
import { IconChevronDown } from '@tabler/icons-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { LoginDiff } from '../components/LoginDiff'
import { Combobox } from '../components/Combobox'
import { lookupHint } from '../components/lookupText'
import { LookupTable } from '../components/LookupTable'
import { TargetBar } from '../components/TargetBar'
import { operationLink, operationsFor } from '../components/useInOperation'
import { PageHeader } from '../shell/PageHeader'
import { useLookup, type LookupItem } from '../api/lookups'
import { useOperations } from '../api/operations'
import { useDatabases, useServers } from '../api/servers'

/** One tab = one lookup shown as a table. `db` tabs need a database; the lookups live in `lookups/*.yaml`. */
interface Tab {
  id: string
  label: string
  lookup: string
  db?: boolean
}

const SERVER_TABS: Tab[] = [
  { id: 'databases', label: 'Databases', lookup: 'databases_detail' },
  { id: 'logins', label: 'Logins', lookup: 'logins' },
  { id: 'sysadmins', label: 'Sysadmins', lookup: 'sysadmins' },
  { id: 'server_roles', label: 'Server roles', lookup: 'server_roles' },
  { id: 'jobs', label: 'Agent jobs', lookup: 'jobs' },
  { id: 'sessions', label: 'Sessions', lookup: 'sessions' },
  { id: 'linked', label: 'Linked servers', lookup: 'linked_servers' },
]

const DATABASE_TABS: Tab[] = [
  { id: 'users', label: 'Users', lookup: 'users', db: true },
  { id: 'orphans', label: 'Orphaned users', lookup: 'orphaned_users', db: true },
  { id: 'db_roles', label: 'Database roles', lookup: 'database_roles', db: true },
  { id: 'schemas', label: 'Schemas', lookup: 'schemas', db: true },
  { id: 'tables', label: 'Tables', lookup: 'tables', db: true },
  { id: 'views', label: 'Views', lookup: 'views', db: true },
  { id: 'procedures', label: 'Procedures', lookup: 'procedures', db: true },
  { id: 'functions', label: 'Functions', lookup: 'functions', db: true },
]

const LOGIN_360 = 'login360'
const COMPARE = 'compare'

/**
 * Read-only discovery: what is on a server, without writing a query. Each tab is a lookup rendered as a
 * searchable, sortable table (with CSV export). "Login 360°" gathers everything one login touches.
 * Nothing here changes the server.
 */
export default function ExplorerPage() {
  const servers = useServers()
  const [serverName, setServerName] = useState<string | null>(null)
  const [database, setDatabase] = useState('')
  const [tabId, setTabId] = useState('databases')
  const [login, setLogin] = useState('')

  const databases = useDatabases(serverName)
  const server = servers.data?.find((s) => s.name === serverName)

  const tab = [...SERVER_TABS, ...DATABASE_TABS].find((t) => t.id === tabId)
  const where = tab?.db ? database || null : tabId === LOGIN_360 ? 'login 360°' : tabId === COMPARE ? 'compare logins' : 'server level'

  // "Use in operation": the operations that accept an item of the open table (worked out from the catalog,
  // see useInOperation.ts). Choosing one opens the Operations page with this row already filled in.
  const navigate = useNavigate()
  const operations = useOperations(serverName)
  const targets = tab ? operationsFor(operations.data ?? [], tab.lookup) : []
  const rowAction =
    serverName && targets.length > 0
      ? (item: LookupItem) => (
          <Menu position="bottom-end" withinPortal shadow="md" width={320}>
            <Menu.Target>
              <Button size="compact-xs" variant="default" rightSection={<IconChevronDown size={12} />} aria-label={`Use ${item.value} in an operation`}>
                Use in…
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {targets.map((t) => (
                <Menu.Item
                  key={t.operation.id}
                  color={t.operation.destructive ? 'red' : undefined}
                  onClick={() => navigate(operationLink(serverName, tab?.db ? database : '', t.operation.id, t.param.name, item.value))}
                >
                  <Text size="xs" c="dimmed" span>
                    [{t.operation.category}]
                  </Text>{' '}
                  {t.operation.name}
                  {t.operation.destructive ? ' ⚠' : ''}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        )
      : undefined

  return (
    <Stack gap="md">
      <PageHeader title="Explorer" description="Browse what is on a server without writing a query. Nothing here changes it." />

      <TargetBar server={server} where={where} summary="Browsing (read-only)" />

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

          {tab?.db && (
            <Select
              label="Database"
              placeholder="Select a database…"
              w={260}
              searchable
              disabled={databases.isPending}
              data={(databases.data ?? []).map((d) => ({
                value: d.name,
                label: d.isOnline ? d.name : `${d.name} (${d.state.toLowerCase()})`,
                disabled: !d.isOnline,
              }))}
              value={database || null}
              onChange={(next) => setDatabase(next ?? '')}
            />
          )}
        </Group>
      )}

      {serverName && (
        <>
          {/* One tab strip, three groups. The group names are small captions; the value of the active tab is a plain string. */}
          <Tabs value={tabId} onChange={(next) => next && setTabId(next)}>
            <Stack gap={4}>
              <TabGroup caption="Server" tabs={SERVER_TABS} />
              <TabGroup caption="Database" tabs={DATABASE_TABS} />
              <Group gap="xs" wrap="nowrap">
                <Text size="xs" tt="uppercase" c="dimmed" w={72}>
                  Principal
                </Text>
                <Tabs.List style={{ border: 'none' }}>
                  <Tabs.Tab value={LOGIN_360}>Login 360°</Tabs.Tab>
                  <Tabs.Tab value={COMPARE}>Compare logins</Tabs.Tab>
                </Tabs.List>
              </Group>
            </Stack>
          </Tabs>

          {tabId === LOGIN_360 && <Login360 serverName={serverName} login={login} onLogin={setLogin} />}
          {/* key: a different server on the left means different logins, so start the comparison again. */}
          {tabId === COMPARE && <LoginDiff key={serverName} serverName={serverName} />}

          {tab && !tab.db && (
            <LookupTable key={tab.id} serverName={serverName} lookupId={tab.lookup} title={tab.label} rowAction={rowAction} />
          )}

          {tab?.db && !database && (
            <Text c="dimmed" size="sm">
              Select a database to list its {tab.label.toLowerCase()}.
            </Text>
          )}
          {tab?.db && database && (
            <LookupTable
              key={`${tab.id}-${database}`}
              serverName={serverName}
              lookupId={tab.lookup}
              database={database}
              title={`${tab.label} in ${database}`}
              rowAction={rowAction}
            />
          )}
        </>
      )}
    </Stack>
  )
}

/** A captioned row of tabs. All rows share ONE <Tabs> (above), so exactly one tab is active across the three rows. */
function TabGroup({ caption, tabs }: { caption: string; tabs: Tab[] }) {
  return (
    <Group gap="xs" wrap="nowrap" align="center">
      <Text size="xs" tt="uppercase" c="dimmed" w={72}>
        {caption}
      </Text>
      <Tabs.List style={{ border: 'none', flexWrap: 'wrap' }}>
        {tabs.map((t) => (
          <Tabs.Tab key={t.id} value={t.id}>
            {t.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Group>
  )
}

/** Everything one login touches on the server, from the same lookups the operations use. */
function Login360({ serverName, login, onLogin }: { serverName: string; login: string; onLogin: (login: string) => void }) {
  const logins = useLookup(serverName, 'logins')
  const args = { login_name: login }

  return (
    <Stack gap="md">
      {/* The app's own combobox (full list on focus). Read-only page: protected logins may be viewed. */}
      <Combobox
        label="Login"
        value={login}
        onChange={onLogin}
        items={(logins.data?.items ?? []).map((i) => ({ value: i.value, hint: lookupHint(i) }))}
        placeholder={logins.isPending ? 'loading…' : 'pick or type a login'}
        w={288}
      />

      {login === '' ? (
        <Text c="dimmed" size="sm">
          Choose a login to see its status, roles, sessions, jobs and databases.
        </Text>
      ) : (
        <Stack gap="md">
          <LookupTable key={`s-${login}`} serverName={serverName} lookupId="login_status" args={args} title="Status" emptyText="No such login." />
          <LookupTable key={`i-${login}`} serverName={serverName} lookupId="login_impact" args={args} title="What it holds (counts)" />
          <LookupTable
            key={`r-${login}`}
            serverName={serverName}
            lookupId="server_roles"
            args={args}
            filter={(item) => (item.extra as Record<string, unknown>).is_member === true}
            title="Server roles it is a member of"
            emptyText="Not a member of any server role."
          />
          <LookupTable key={`se-${login}`} serverName={serverName} lookupId="sessions" args={args} title="Open sessions" emptyText="No open sessions." />
          <LookupTable key={`j-${login}`} serverName={serverName} lookupId="jobs" args={args} title="SQL Agent jobs it owns" emptyText="Owns no jobs." />
          <LookupTable key={`d-${login}`} serverName={serverName} lookupId="databases_owned" args={args} title="Databases it owns" emptyText="Owns no databases." />
          <Text size="xs" c="dimmed">
            Its users in every database: run the <em>User mapping</em> or <em>Database role memberships (all databases)</em> audit on the Operations page.
          </Text>
        </Stack>
      )}
    </Stack>
  )
}
