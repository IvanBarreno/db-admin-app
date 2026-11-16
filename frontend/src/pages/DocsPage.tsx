import { Accordion, Alert, Badge, Group, List, Paper, Select, Skeleton, Stack, Table, Tabs, Text, TextInput, Title } from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useOperations, type OperationSummary } from '../api/operations'
import { useServers } from '../api/servers'
import { PageHeader } from '../shell/PageHeader'

/**
 * In-app documentation. Two kinds of content:
 *   - written guides (how the app works, safety rules, passwords, troubleshooting), kept in this file so
 *     they change together with the code they describe;
 *   - the operations CATALOG, read live from the API, so it can never be out of date: a new operation in
 *     a YAML file shows up here by itself with its description and parameters.
 */
export default function DocsPage() {
  return (
    <Stack gap="md">
      <PageHeader title="Documentation" description="How the app works, what its safety rules are, and every operation it can run." />

      {/* Vertical tabs on wide windows: a table of contents on the left. */}
      <Tabs defaultValue="start" orientation="vertical" keepMounted={false}>
        <Tabs.List mr="lg" style={{ minWidth: 190 }}>
          <Tabs.Tab value="start">Getting started</Tabs.Tab>
          <Tabs.Tab value="pages">The pages</Tabs.Tab>
          <Tabs.Tab value="safety">Safety rules</Tabs.Tab>
          <Tabs.Tab value="passwords">Passwords</Tabs.Tab>
          <Tabs.Tab value="offboarding">Offboarding</Tabs.Tab>
          <Tabs.Tab value="catalog">Operations catalog</Tabs.Tab>
          <Tabs.Tab value="help">Troubleshooting</Tabs.Tab>
        </Tabs.List>

        <div style={{ flex: 1, minWidth: 0 }}>
          <Tabs.Panel value="start">
            <GettingStarted />
          </Tabs.Panel>
          <Tabs.Panel value="pages">
            <PagesGuide />
          </Tabs.Panel>
          <Tabs.Panel value="safety">
            <SafetyRules />
          </Tabs.Panel>
          <Tabs.Panel value="passwords">
            <PasswordsGuide />
          </Tabs.Panel>
          <Tabs.Panel value="offboarding">
            <OffboardingGuide />
          </Tabs.Panel>
          <Tabs.Panel value="catalog">
            <CatalogReference />
          </Tabs.Panel>
          <Tabs.Panel value="help">
            <Troubleshooting />
          </Tabs.Panel>
        </div>
      </Tabs>
    </Stack>
  )
}

// ---------------------------------------------------------------------------------------------------
// Small building blocks, so every section reads the same
// ---------------------------------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap="sm" maw={820}>
      <Title order={3} size="h4">
        {title}
      </Title>
      {children}
    </Stack>
  )
}

function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap={4}>
      <Text fw={600}>{title}</Text>
      {children}
    </Stack>
  )
}

const P = ({ children }: { children: ReactNode }) => <Text size="sm">{children}</Text>

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <List type="ordered" size="sm" spacing={4}>
      {items.map((item, i) => (
        <List.Item key={i}>{item}</List.Item>
      ))}
    </List>
  )
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <List size="sm" spacing={4}>
      {items.map((item, i) => (
        <List.Item key={i}>{item}</List.Item>
      ))}
    </List>
  )
}

// ---------------------------------------------------------------------------------------------------
// Written guides
// ---------------------------------------------------------------------------------------------------

function GettingStarted() {
  return (
    <Section title="Getting started">
      <P>
        SQL Admin Console runs everyday SQL Server and Azure SQL administration tasks against servers that already exist. You never
        write the SQL by hand for common tasks: pick an operation, fill in its fields, <b>preview the exact SQL</b>, then run it.
        Everything that runs is recorded in the audit log.
      </P>

      <Sub title="Run a task">
        <Steps
          items={[
            <>
              Open <Link to="/operations">Operations</Link> and choose the <b>server</b>. The coloured bar under the title shows where you are
              pointed; <b>red means Production</b>.
            </>,
            'Choose the operation. Its description appears under the picker. Operations are grouped by category: audit (read-only), provisioning, changes and offboarding.',
            'Fill in the fields. Lists (logins, databases, roles…) come from the server itself, so you pick what really exists. A field that cannot load its list is disabled and says why.',
            <>
              Press <b>Preview</b>. For most operations you see the exact statements that will run, plus the preflight checks (a red check blocks the run).
            </>,
            <>
              Press <b>Execute</b>. Destructive operations open a confirmation dialog first. Results appear below; use <b>Export CSV</b> to save a table.
            </>,
          ]}
        />
      </Sub>

      <Sub title="Where things are kept">
        <Bullets
          items={[
            'Servers and their secrets are configured by whoever installs the app (servers.json plus environment variables or user-secrets); see the README.',
            'The audit log is a local file (audit.db) on the machine running the app. It is created automatically on first start.',
            'Offboarding permission snapshots are JSON files in a snapshots folder next to it.',
          ]}
        />
      </Sub>
    </Section>
  )
}

function PagesGuide() {
  const rows: [string, string, string][] = [
    ['/', 'Servers', 'Every configured server with its environment. "Test connection" tells you whether the app can reach it and as which login.'],
    ['/explorer', 'Explorer', 'Browse databases, logins, roles, jobs, sessions, users, tables and more without writing a query. Search, sort, export CSV. "Use in…" on a row opens an operation with that name filled in. "Login 360°" gathers everything one login touches; "Compare logins" shows two logins side by side, even on different servers.'],
    ['/operations', 'Operations', 'The catalog of tasks: preview, then run. See "Operations catalog" in this documentation for the full list.'],
    ['/offboarding', 'Offboarding', 'A guided checklist to remove a leaver\'s access in the right order, confirmed once.'],
    ['/sql', 'Custom SQL', 'A free-form query box for anything the catalog does not cover. Unrestricted by design, and every run is audited with the full text. Batches separated by GO run in order; each SELECT becomes a result tab.'],
    ['/audit', 'Audit log', 'Every run on this machine, newest first. Filter by user, server and status. "Details" opens the full SQL, the parameters (passwords shown as ***) and the per-database steps; it is disabled when a run has nothing more to show.'],
  ]

  return (
    <Section title="The pages">
      <Paper withBorder>
        <Table verticalSpacing="xs" fz="sm" withRowBorders>
          <Table.Tbody>
            {rows.map(([to, name, text]) => (
              <Table.Tr key={to}>
                <Table.Td w={140} fw={600} style={{ verticalAlign: 'top' }}>
                  <Link to={to}>{name}</Link>
                </Table.Td>
                <Table.Td>{text}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
      <Text size="sm" c="dimmed">
        The header has a light / dark switch and the API status; the button at the bottom of the sidebar collapses it to icons.
      </Text>
    </Section>
  )
}

function SafetyRules() {
  return (
    <Section title="Safety rules">
      <Sub title="You always see where you are">
        <P>
          The bar under every page title names the server, its environment (Development blue, Test amber, <b>Production red</b>), where the change
          lands (a database, server level, or all online databases) and what is about to run. The Execute button repeats the target.
        </P>
      </Sub>

      <Sub title="Nothing runs blind">
        <Bullets
          items={[
            <>
              <b>Preview</b> shows the exact statements. Operations that build SQL at run time are asked what they <i>would</i> run (a dry run), so you
              confirm the real <code>KILL</code>, <code>DROP USER</code> or <code>ALTER ROLE</code>, not a template.
            </>,
            <>
              <b>Preflight checks</b> look at the real server before anything changes (does the login exist, is the new owner enabled, can Windows resolve
              the account…). A blocking check turns the run off; warnings are informational.
            </>,
            'Preview again after any edit: the confirmation is tied to the exact values you previewed.',
          ]}
        />
      </Sub>

      <Sub title="Destructive operations">
        <P>
          Anything that takes access away or removes something (disable, drop, revoke, deny, kill sessions) asks for confirmation in a dialog with the
          statements and a recap. On a <b>Production</b> server you must also type the server name.
        </P>
      </Sub>

      <Sub title="Protected logins">
        <P>
          The login the app connects with, and any login listed in <code>ProtectedLogins</code> for that server, are <b>view only</b>: they appear locked in
          pickers and every changing operation refuses them. This stops you from locking the tool out of its own server. Audits can still look at them.
          Custom SQL is not restricted.
        </P>
      </Sub>

      <Sub title="Lists and stopping at the first error">
        <P>
          Operations that act on several items (logins, databases, roles…) report one result per item. By default they stop at the first error and mark the rest
          as skipped; switch <i>Stop at the first error</i> off to try every item. Unticking everything never means &ldquo;all&rdquo;: an empty selection does nothing.
        </P>
      </Sub>

      <Sub title="The audit trail">
        <P>
          Every execution is recorded with who ran it, when, where, the SQL, the parameters and any per-database steps. Passwords are stored as <code>***</code>,
          never in clear.
        </P>
      </Sub>
    </Section>
  )
}

function PasswordsGuide() {
  return (
    <Section title="Passwords">
      <Sub title="Every password field has the same tools">
        <Bullets
          items={[
            'The eye shows or hides what you typed; the copy button copies it.',
            <>
              <b>Generate…</b> opens the generator: length (12–128), upper / lower case, digits, symbols, and excluding look-alikes (0 O 1 l I). The password lands in the
              field before the run so you can read and copy it. Tick &ldquo;Save these options as the default&rdquo; to change the defaults for the whole app (kept in this browser).
            </>,
            'Where the field says "generated when the run starts", leaving it empty is valid: the app generates a strong password at run time.',
          ]}
        />
      </Sub>

      <Sub title="Several logins at once">
        <P>
          <b>Create several SQL logins</b> and <b>Reset passwords of several logins</b> show one row per login, each with its own password box and its own
          generator. <b>Paste a list…</b> turns a column of names into rows. <b>Generate all</b> fills every empty box now so you can copy them before the run;
          <b> Clear passwords</b> empties them again.
        </P>
        <Bullets
          items={[
            'A password you typed is kept exactly as typed. An empty box gets a different generated password.',
            <>
              The result table shows the password only for logins whose password was <b>generated</b>. A typed one shows <code>(as typed)</code>. Use <b>Export CSV</b>
              to hand generated passwords over: they are not stored anywhere else.
            </>,
          ]}
        />
      </Sub>

      <Sub title="Where passwords never appear">
        <P>Not in the audit log (<code>***</code>), not in the SQL preview (<code>&apos;***&apos;</code>), and not in the confirmation dialog.</P>
      </Sub>
    </Section>
  )
}

function OffboardingGuide() {
  return (
    <Section title="Offboarding">
      <P>
        The <Link to="/offboarding">Offboarding</Link> page removes a leaver&apos;s access as one checklist, in a safe order, and asks for confirmation once.
      </P>
      <Steps
        items={[
          'Choose the server and the login to offboard, and the new owner who takes over databases (and, unless you set another, SQL Agent jobs).',
          <>
            Tick the steps: snapshot (always first, saved to a file as your way back), disable the login, kill active sessions, reassign Agent jobs, reassign databases, remove server
            roles and permissions, drop the user in every online database, drop the login.
          </>,
          <>
            <b>Preview all steps</b>: you see the checks, a report of what the run will touch (sessions, jobs, databases, roles) and the statements of every step.
          </>,
          'Run the checklist and confirm once. A failed step stops the rest; fix the cause and run again with the finished steps unticked.',
        ]}
      />
      <Text size="sm" c="dimmed">
        Databases that are not online are skipped by the per-database steps; the page warns you which ones. Advanced options let you pick which jobs, databases and
        sessions are included and give the jobs a different owner.
      </Text>
    </Section>
  )
}

function Troubleshooting() {
  return (
    <Section title="Troubleshooting">
      <Accordion variant="contained" multiple>
        <Accordion.Item value="connect">
          <Accordion.Control>A server shows &ldquo;Connection failed&rdquo;</Accordion.Control>
          <Accordion.Panel>
            <Bullets
              items={[
                'Check that the secrets for that server are set on the machine running the app (environment variables, or user-secrets in development). A missing secret is reported as "Missing credentials".',
                'Azure SQL serverless databases pause when idle; the first connection can time out while it wakes up. Try again after a few seconds.',
                'If it worked before and suddenly fails everywhere, an old copy of the app may still be running and answering on the port. Stop it and start the current one.',
              ]}
            />
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="empty">
          <Accordion.Control>A list is empty or a field is disabled</Accordion.Control>
          <Accordion.Panel>
            <P>The field says why. The usual causes:</P>
            <Bullets
              items={[
                'Nothing exists yet (for example no orphaned users in that database).',
                'The account the app connects with may not read it: the message names the permission needed (VIEW ANY DEFINITION, VIEW SERVER STATE, access to msdb).',
                'It is not available for that engine (Azure SQL has no SQL Agent and no server-level roles).',
                'Something it depends on is not chosen yet (a database, a login, an action).',
              ]}
            />
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="cannot">
          <Accordion.Control>&ldquo;Cannot run yet&rdquo; under the buttons</Accordion.Control>
          <Accordion.Panel>
            <P>
              A required field has nothing to choose from or no value. The text names the first reason. For database-level operations, pick the database
              (a server with a default database, such as an Azure SQL database, may leave it blank).
            </P>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="blocked">
          <Accordion.Control>The run is blocked by a red check</Accordion.Control>
          <Accordion.Panel>
            <P>
              A preflight check found a problem in the real server state (login already exists, the new owner equals the leaver, the login is protected…). Fix the value or the
              server, then preview again. No confirmation is offered while a check blocks.
            </P>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="confirm">
          <Accordion.Control>&ldquo;Confirmation required&rdquo; or &ldquo;Preflight checks failed&rdquo; after pressing Execute</Accordion.Control>
          <Accordion.Panel>
            <P>
              The server changed or the values changed between the preview and the run. Preview again; the confirmation is bound to the exact request, and the checks run again
              right before execution.
            </P>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="audit">
          <Accordion.Control>The audit log is empty or lost</Accordion.Control>
          <Accordion.Panel>
            <P>
              It is a local file, <code>audit.db</code>, in the folder the app was started from. A new empty one is created when none exists, so starting the app from a different folder
              shows a different (new) history. Another machine&apos;s history can be merged with <code>SqlAdmin import-audit &lt;file&gt;</code>; see the README.
            </P>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Section>
  )
}

// ---------------------------------------------------------------------------------------------------
// Live operations catalog (from the API)
// ---------------------------------------------------------------------------------------------------

const SCOPE_LABEL: Record<OperationSummary['scope'], string> = {
  Server: 'server level',
  Database: 'one database',
  AllDatabases: 'all online databases',
}

/**
 * Every operation the chosen server can run, with its description and parameters. The list depends on the
 * server's engine (Azure SQL has fewer operations than SQL Server), hence the server picker.
 */
function CatalogReference() {
  const servers = useServers()
  const [chosen, setChosen] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Until the DBA picks one, use the first configured server.
  const serverName = chosen ?? servers.data?.[0]?.name ?? null
  const operations = useOperations(serverName)

  const grouped = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const matches = (op: OperationSummary) =>
      needle === '' ||
      `${op.name} ${op.id} ${op.description ?? ''} ${op.params.map((p) => `${p.label ?? ''} ${p.name}`).join(' ')}`.toLowerCase().includes(needle)

    const byCategory = new Map<string, OperationSummary[]>()
    for (const op of operations.data ?? []) {
      if (!matches(op)) continue
      byCategory.set(op.category, [...(byCategory.get(op.category) ?? []), op])
    }
    return [...byCategory]
  }, [operations.data, search])

  const total = grouped.reduce((n, [, ops]) => n + ops.length, 0)

  return (
    <Section title="Operations catalog">
      <P>
        Read live from the app, so it is always current. The list depends on the server: Azure SQL Database has no SQL Agent and no server-level logins, so it offers fewer operations.
      </P>

      <Group align="flex-end" gap="sm">
        <Select
          label="Operations available on"
          w={260}
          allowDeselect={false}
          data={(servers.data ?? []).map((s) => s.name)}
          value={serverName}
          onChange={setChosen}
          disabled={servers.isPending || (servers.data?.length ?? 0) === 0}
        />
        <TextInput
          label="Search"
          placeholder="name, description or field…"
          w={300}
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
      </Group>

      {servers.isError && (
        <Alert color="red" variant="light">
          Could not load servers: {servers.error.message}
        </Alert>
      )}
      {(servers.isPending || operations.isPending) && serverName !== null && <Skeleton height={120} />}
      {servers.data?.length === 0 && <Text c="dimmed">No servers are configured, so there is no catalog to list yet.</Text>}
      {operations.isError && (
        <Alert color="red" variant="light">
          Could not load the catalog: {operations.error.message}
        </Alert>
      )}

      {operations.data && (
        <>
          <Text size="xs" c="dimmed">
            {total} operation{total === 1 ? '' : 's'}
            {search ? ' match' : ''}
          </Text>
          {/* One accordion per category; every operation inside is its own collapsible block. */}
          <Accordion variant="separated" multiple defaultValue={grouped.map(([category]) => category)} key={`${serverName}-${search}`}>
            {grouped.map(([category, ops]) => (
              <Accordion.Item key={category} value={category}>
                <Accordion.Control>
                  <Group gap="xs">
                    <Text fw={600} tt="capitalize">
                      {category}
                    </Text>
                    <Badge size="sm" variant="light" color="gray">
                      {ops.length}
                    </Badge>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="sm">
                    {ops.map((op) => (
                      <OperationDoc key={op.id} op={op} serverName={serverName} />
                    ))}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        </>
      )}
    </Section>
  )
}

function OperationDoc({ op, serverName }: { op: OperationSummary; serverName: string | null }) {
  // The per-login password parameter is drawn as part of its list (one row per login), so it is not listed twice.
  const params = op.params.filter((p) => !(p.type === 'Password' && p.generateForEach))

  return (
    <Paper withBorder p="sm">
      <Stack gap={6}>
        <Group gap="xs" justify="space-between" wrap="nowrap" align="flex-start">
          <div>
            <Text fw={600}>{op.name}</Text>
            <Text size="xs" c="dimmed" ff="monospace">
              {op.id}
            </Text>
          </div>
          <Group gap={4} wrap="wrap" justify="flex-end">
            <Badge size="sm" variant="light" color="gray">
              {SCOPE_LABEL[op.scope]}
            </Badge>
            {op.readOnly && (
              <Badge size="sm" variant="light" color="green">
                read-only
              </Badge>
            )}
            {op.destructive && (
              <Badge size="sm" variant="light" color="red">
                asks for confirmation
              </Badge>
            )}
          </Group>
        </Group>

        {op.description && <Text size="sm">{op.description}</Text>}

        {params.length > 0 && (
          <Table fz="xs" verticalSpacing={3} withRowBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Field</Table.Th>
                <Table.Th>Kind</Table.Th>
                <Table.Th>What it is</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {params.map((p) => (
                <Table.Tr key={p.name}>
                  <Table.Td fw={500} style={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                    {p.label ?? p.name.replaceAll('_', ' ')}
                    {p.required && (
                      <Text span c="red">
                        {' '}
                        *
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td c="dimmed" style={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                    {kindOf(p)}
                  </Table.Td>
                  <Table.Td>{p.help}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}

        <Text size="xs" c="dimmed">
          <Link to={`/operations?server=${encodeURIComponent(serverName ?? '')}&operation=${encodeURIComponent(op.id)}`}>Open in Operations</Link>
        </Text>
      </Stack>
    </Paper>
  )
}

/** One short word for the kind of control a parameter gets. */
function kindOf(p: OperationSummary['params'][number]): string {
  if (p.checklistGroup) return 'role checklist'
  if (p.multi) return p.effectiveSource ? 'list to tick' : 'list to type'
  switch (p.type) {
    case 'Login':
      return 'login'
    case 'User':
      return 'user'
    case 'Database':
      return 'database'
    case 'Choice':
      return `choice (${(p.choices ?? []).join(' / ')})`
    case 'Bool':
      return 'yes / no'
    case 'Int':
      return 'number'
    case 'Password':
      return 'password'
    default:
      return p.effectiveSource ? 'picker' : 'text'
  }
}
