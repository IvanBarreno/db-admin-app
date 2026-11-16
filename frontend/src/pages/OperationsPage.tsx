import { Accordion, Alert, Button, Code, Group, Modal, Paper, Select, Skeleton, Stack, Text, TextInput } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconAlertTriangle, IconPlayerPlay, IconSearch } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { readOperationLink } from '../components/useInOperation'
import { AccessComparison } from '../components/AccessComparison'
import { EnvBadge } from '../components/EnvBadge'
import { ParamForm } from '../components/ParamForm'
import { PreflightPanel } from '../components/PreflightPanel'
import { ConfirmRecap } from '../components/ConfirmRecap'
import { TargetBar } from '../components/TargetBar'
import { describeOperation, principalsOf, scopeLabel, targetLabel } from '../components/target'
import { ResultsGrid } from '../components/ResultsGrid'
import { StatementList } from '../components/StatementList'
import { GeneratedPasswords } from '../components/GeneratedPasswords'
import { StepLog } from '../components/StepLog'
import { PageHeader } from '../shell/PageHeader'
import { useDatabases, useServers } from '../api/servers'
import { useExecuteOperation, useOperations, usePreviewOperation } from '../api/operations'

/** "3 statements in 2 databases" from a dry run; null when the operation has no dry run. */
function statementSummary(statements: readonly { database?: string | null }[] | null | undefined): string | null {
  if (!statements) return null
  const databases = new Set(statements.map((s) => s.database).filter(Boolean))
  const count = `${statements.length} statement${statements.length === 1 ? '' : 's'}`
  return databases.size > 0 ? `${count} in ${databases.size} database${databases.size === 1 ? '' : 's'}` : count
}

/** Operation catalog: pick a server, pick an operation, fill its params, preview or run it. */
export default function OperationsPage() {
  const servers = useServers()
  // Arriving from the Explorer's "Use in operation" (/operations?server=…&operation=…&p.login_name=…): start
  // with that server, operation and value. Read ONCE, as the initial state; a plain /operations starts blank.
  const [searchParams] = useSearchParams()
  const [start] = useState(() => readOperationLink(searchParams))
  const [serverName, setServerName] = useState<string | null>(start.serverName)
  const [database, setDatabase] = useState<string>(start.database)
  const [operationId, setOperationId] = useState<string | null>(start.operationId)
  const [paramValues, setParamValues] = useState<Record<string, string>>(start.params)
  // Why a required field cannot be filled in right now (empty list on the server, no permission...): keeps Preview / Execute off.
  const [formBlocked, setFormBlocked] = useState<string[]>([])

  const databases = useDatabases(serverName)
  const operations = useOperations(serverName)
  const operation = operations.data?.find((o) => o.id === operationId)

  const preview = usePreviewOperation(operationId ?? '')
  const execute = useExecuteOperation(operationId ?? '')

  const server = servers.data?.find((s) => s.name === serverName)

  // Only database-scope operations work inside ONE database, so only they get (and send) a database.
  // Server-scope ops ignore it; all-databases ops pick theirs in their own checklist.
  const needsDatabase = operation?.scope === 'Database'
  const effectiveDatabase = needsDatabase ? database : ''
  // Reasons the buttons stay off: a required field cannot be filled, or a database-level run has no database
  // (a server with a default database, such as an Azure SQL Database, may leave it blank).
  const missingDatabase = needsDatabase && !database && !server?.defaultDatabase
  const cannotFill = missingDatabase ? ['Select the database this operation works in.', ...formBlocked] : formBlocked

  // Target context (F4): where the change lands and what it is, repeated in the bar, the button and the recap.
  const where = server ? scopeLabel(operation?.scope ?? null, effectiveDatabase, server) : null
  const summary = operation ? describeOperation(operation, paramValues) : null

  // Destructive operations: the preview hands back a token bound to the exact request, and
  // Production servers also need the server name typed. Both go back with /execute — from the confirm dialog.
  const [confirming, setConfirming] = useState(false)
  const [typedServerName, setTypedServerName] = useState('')
  const pendingConfirm = preview.data?.destructive ? preview.data : null
  const confirmReady = !pendingConfirm?.requiresServerName || typedServerName === serverName
  // A failed blocking preflight check stops the run (no token is issued, and execute would answer 409).
  const blocked = preview.data?.checks?.some((c) => c.blocking) ?? false

  function buildRequest() {
    return {
      serverName: serverName!,
      database: effectiveDatabase || null,
      params: paramValues,
      confirmToken: null,
      confirmServerName: null,
    }
  }

  /**
   * The token only fits the request it was issued for, so any edit throws the preview away. The previous RUN's
   * result goes too: a grid that belongs to other values would be read as the answer to the new ones.
   */
  function resetPreview() {
    preview.reset()
    execute.reset()
    setConfirming(false)
    setTypedServerName('')
  }

  function changeParams(values: Record<string, string>) {
    setParamValues(values)
    resetPreview()
  }

  function runPreview() {
    if (!serverName || !operationId) return
    preview.mutate(buildRequest())
  }

  /** Sends the run, with the token of the preview, and tells the DBA how it went (the details are below). */
  function sendExecute(current: NonNullable<typeof preview.data>) {
    setConfirming(false)
    execute.mutate(
      {
        ...buildRequest(),
        confirmToken: current.confirmToken,
        confirmServerName: current.requiresServerName ? typedServerName : null,
      },
      {
        onSuccess: (result) =>
          notifications.show(
            result.success
              ? { color: 'green', title: 'Run finished', message: `${operation?.name ?? operationId} · ${result.elapsedMs} ms` }
              : { color: 'red', title: 'Run failed', message: result.error ?? 'See the details below the buttons.' },
          ),
        onError: (error) => notifications.show({ color: 'red', title: 'Run refused', message: error.message }),
      },
    )
  }

  async function runExecute() {
    if (!serverName || !operationId) return
    // Always preview first: it tells us whether this run is destructive and gives the token.
    const current = preview.data ?? (await preview.mutateAsync(buildRequest()).catch(() => null))
    if (!current) return // preview failed; its error is shown below
    if (current.checks?.some((c) => c.blocking)) return // blocked by a preflight check; shown below
    // A destructive run waits for the confirm dialog: the DBA reviews the statements and the recap there.
    if (current.destructive) {
      setConfirming(true)
      return
    }
    sendExecute(current)
  }

  // Operations grouped by category in the picker: [{ group: 'audit', items: [...] }, ...] is Mantine's format.
  const operationOptions = useMemo(() => {
    const byCategory = new Map<string, { value: string; label: string }[]>()
    for (const op of operations.data ?? []) {
      const items = byCategory.get(op.category) ?? []
      items.push({ value: op.id, label: `${op.name}${op.destructive ? ' ⚠' : ''}` })
      byCategory.set(op.category, items)
    }
    return [...byCategory].map(([group, items]) => ({ group, items }))
  }, [operations.data])

  return (
    <Stack gap="md">
      <PageHeader title="Operations" description="Pick a server and an operation, fill it in, preview the exact SQL, then run it." />

      <TargetBar server={server} where={operation ? where : null} summary={summary} />

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
              setOperationId(null)
              changeParams({})
            }}
          />
          {server && (
            <div style={{ paddingBottom: 6 }}>
              <EnvBadge environment={server.environment} />
            </div>
          )}
        </Group>
      )}

      {serverName && (
        <div>
          {operations.isPending && <Skeleton height={36} maw={520} />}
          {operations.isError && (
            <Alert color="red" variant="light">
              Could not load operations: {operations.error.message}
            </Alert>
          )}
          {operations.data && (
            <Select
              label="Operation"
              placeholder="Select an operation…"
              maw={520}
              searchable
              nothingFoundMessage="No operation matches"
              data={operationOptions}
              value={operationId}
              // What the chosen operation does, in plain words, right under the picker.
              description={operation?.description ?? undefined}
              inputWrapperOrder={['label', 'input', 'description', 'error']}
              onChange={(next) => {
                setOperationId(next)
                changeParams({})
              }}
            />
          )}
        </div>
      )}

      {operation && (
        <Paper withBorder p="md">
          <Stack gap="md">
            {/* Only here, and only for operations that work inside one database: the user / role lists below need it. */}
            {needsDatabase && (
              <Select
                label="Database"
                withAsterisk
                description="This operation works inside one database."
                inputWrapperOrder={['label', 'input', 'description', 'error']}
                placeholder={databases.isPending ? 'loading…' : `Select a database… (blank = ${server?.defaultDatabase ?? 'login default'})`}
                w={320}
                searchable
                disabled={databases.isPending}
                data={(databases.data ?? []).map((d) => ({
                  value: d.name,
                  label: d.isOnline ? d.name : `${d.name} (${d.state.toLowerCase()})`,
                  disabled: !d.isOnline,
                }))}
                value={database || null}
                onChange={(next) => {
                  setDatabase(next ?? '')
                  changeParams({}) // users and roles belong to the database: start the form again
                }}
              />
            )}

            <ParamForm
              params={operation.params}
              values={paramValues}
              onChange={changeParams}
              serverName={serverName}
              database={effectiveDatabase}
              allowProtected={operation.readOnly}
              onBlockedChange={setFormBlocked}
            />

            {/* Clone: both logins' current access side by side, with what the target will hold afterwards. */}
            {operation.id === 'changes.clone_server_access' && (
              <AccessComparison
                serverName={serverName}
                source={paramValues.source_login ?? ''}
                target={paramValues.target_login ?? ''}
                includeRoles={paramValues.include_roles !== 'false'}
                includePermissions={paramValues.include_permissions !== 'false'}
              />
            )}
            {operation.id === 'changes.clone_database_access' && (
              <AccessComparison
                serverName={serverName}
                source={paramValues.source_user ?? ''}
                target={paramValues.target_user ?? ''}
                includeRoles={paramValues.include_roles !== 'false'}
                includePermissions={paramValues.include_permissions !== 'false'}
                lookupId="database_access"
                argName="user_name"
                database={effectiveDatabase}
              />
            )}

            <Group gap="sm" align="center">
              <Button
                variant="default"
                leftSection={<IconSearch size={16} />}
                onClick={runPreview}
                loading={preview.isPending}
                disabled={cannotFill.length > 0}
              >
                Preview
              </Button>
              <Button
                color={pendingConfirm ? 'red' : undefined}
                leftSection={<IconPlayerPlay size={16} />}
                onClick={runExecute}
                loading={execute.isPending}
                disabled={preview.isPending || blocked || cannotFill.length > 0}
              >
                {targetLabel(pendingConfirm ? 'Review and execute' : 'Execute', server, where)}
              </Button>
              {execute.data && (
                <Text size="sm" c="dimmed">
                  {execute.data.elapsedMs} ms
                </Text>
              )}
            </Group>
            {cannotFill.length > 0 && (
              <Text size="sm" c="orange">
                Cannot run yet: {cannotFill[0]}
              </Text>
            )}
            {execute.isError && (
              <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />}>
                {execute.error.message}
              </Alert>
            )}
            {preview.isError && (
              <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />}>
                {preview.error.message}
              </Alert>
            )}

            {/* Dry run: the real final statements. The template (with @placeholders) stays one click away. */}
            <StatementList statements={preview.data?.statements} />
            {/* Plain operations (no dry run): the same SQL with the values written in, for reading only. */}
            {preview.data?.resolvedBatches && (
              <Paper withBorder>
                <Text size="xs" fw={600} px="sm" py={6} style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
                  SQL with your values{' '}
                  <Text span size="xs" c="dimmed" fw={400}>
                    (for reading: the run sends the template below and passes the values as parameters)
                  </Text>
                </Text>
                <Code block style={{ whiteSpace: 'pre-wrap', background: 'transparent' }}>
                  {preview.data.resolvedBatches.join('\nGO\n')}
                </Code>
              </Paper>
            )}
            {preview.data && (
              <Accordion variant="contained" defaultValue={!preview.data.statements && !preview.data.resolvedBatches ? 'template' : null}>
                <Accordion.Item value="template">
                  <Accordion.Control>
                    <Text size="xs">Template SQL</Text>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Code block style={{ whiteSpace: 'pre-wrap' }}>
                      {preview.data.batches.join('\nGO\n')}
                    </Code>
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            )}

            <PreflightPanel checks={preview.data?.checks} />

            {execute.data?.generatedPasswords && <GeneratedPasswords passwords={execute.data.generatedPasswords} />}
            {execute.data?.snapshotPath && (
              <Alert color="green" variant="light">
                Snapshot saved: <Code>{execute.data.snapshotPath}</Code>
              </Alert>
            )}
            {execute.data?.steps && <StepLog steps={execute.data.steps} />}
            {execute.data && <ResultsGrid result={execute.data} exportName={`${serverName} ${operationId}`} />}
          </Stack>
        </Paper>
      )}

      {/* Confirm dialog for destructive runs: nothing destructive can be triggered from outside it. */}
      <Modal
        opened={confirming && pendingConfirm !== null && !blocked}
        onClose={() => setConfirming(false)}
        title={
          <Text fw={700} c="red">
            ⚠ Destructive operation — review and confirm
          </Text>
        }
        size="lg"
        centered
      >
        <Stack gap="md">
          <Text size="sm">The statements below will run. Check the target and the recap, then confirm.</Text>
          {pendingConfirm && <StatementList statements={pendingConfirm.statements} />}
          {server && operation && pendingConfirm && (
            <ConfirmRecap
              rows={[
                ['Server', `${server.name} (${server.environment})`],
                ['Where', where],
                ['Operation', operation.name],
                ['Acts on', principalsOf(operation, paramValues).join(', ')],
                ['Statements', statementSummary(pendingConfirm.statements)],
              ]}
            />
          )}
          {pendingConfirm?.requiresServerName && (
            <TextInput
              label={
                <>
                  Production server: type <strong>{serverName}</strong> to enable the button.
                </>
              }
              value={typedServerName}
              onChange={(e) => setTypedServerName(e.currentTarget.value)}
              autoComplete="off"
              data-autofocus
            />
          )}
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button color="red" disabled={!confirmReady} onClick={() => pendingConfirm && sendExecute(pendingConfirm)}>
              {targetLabel('Confirm and execute', server, where)}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
