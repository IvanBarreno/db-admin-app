import { Accordion, Alert, Badge, Button, Checkbox, Code, Group, List, Modal, Paper, Select, Skeleton, Stack, Table, Text, TextInput } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconAlertTriangle, IconPlayerPlay, IconSearch } from '@tabler/icons-react'
import { useState } from 'react'
import { EnvBadge } from '../components/EnvBadge'
import { ParamForm } from '../components/ParamForm'
import { PreflightPanel, type PanelCheck } from '../components/PreflightPanel'
import { ConfirmRecap } from '../components/ConfirmRecap'
import { TargetBar } from '../components/TargetBar'
import { targetLabel } from '../components/target'
import { ResultsGrid } from '../components/ResultsGrid'
import { StatementList } from '../components/StatementList'
import { StepLog } from '../components/StepLog'
import { PageHeader } from '../shell/PageHeader'
import type { LookupResult } from '../api/lookups'
import { useServers } from '../api/servers'
import {
  useExecuteWorkflow,
  usePreviewWorkflow,
  useWorkflows,
  type WorkflowStepResult,
  type WorkflowSummary,
} from '../api/workflows'

const WORKFLOW_ID = 'offboarding.full'

/**
 * Guided offboarding: pick a server and a login, tick the steps, preview the SQL of all of them,
 * confirm once, and watch each step's status. A failed step stops the rest so the cause can be
 * fixed and the remaining steps run again (steps already done are simply left unticked).
 */
export default function OffboardingPage() {
  const servers = useServers()
  const workflows = useWorkflows()
  const workflow = workflows.data?.find((w) => w.id === WORKFLOW_ID)

  const [serverName, setServerName] = useState<string | null>(null)
  const [paramValues, setParamValues] = useState<Record<string, string>>({})
  // null = "untouched": show the workflow's default selection.
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [typedServerName, setTypedServerName] = useState('')
  // Why a required field cannot be filled in right now: keeps Preview / Run off and says why.
  const [cannotFill, setCannotFill] = useState<string[]>([])

  const preview = usePreviewWorkflow(WORKFLOW_ID)
  const execute = useExecuteWorkflow(WORKFLOW_ID)

  const server = servers.data?.find((s) => s.name === serverName)
  const selected = picked ?? defaultSelection(workflow)
  const pendingConfirm = preview.data?.destructive ? preview.data : null
  const confirmReady = !pendingConfirm?.requiresServerName || typedServerName === serverName
  // Preflight checks of every selected step: one blocking failure stops the whole checklist, before the snapshot.
  const checks: PanelCheck[] | undefined = preview.data?.checks.map((c) => ({ ...c.result, stepTitle: c.stepTitle }))
  const blocked = checks?.some((c) => c.blocking) ?? false

  // Target context (F4): who is being offboarded, from where, repeated in the bar, the button and the recap.
  const leaver = paramValues['login_name']
  const newOwner = paramValues['new_owner']
  const summary = leaver
    ? `Offboard [${leaver}] · ${selected.size} step${selected.size === 1 ? '' : 's'}${newOwner ? ` · new owner [${newOwner}]` : ''}`
    : 'Offboard a login'

  function buildRequest() {
    return {
      serverName: serverName!,
      params: paramValues,
      steps: [...selected],
      confirmToken: null,
      confirmServerName: null,
    }
  }

  /** The token is bound to the exact request, so any edit throws the preview (and last result) away. */
  function resetPreview() {
    preview.reset()
    execute.reset()
    setConfirming(false)
    setTypedServerName('')
  }

  function toggle(key: string) {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setPicked(next)
    resetPreview()
  }

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
              ? { color: 'green', title: 'Checklist finished', message: `Offboarding of [${leaver}] · ${result.elapsedMs} ms` }
              : { color: 'red', title: 'Checklist stopped', message: 'A step failed; later steps did not run. Details below.' },
          ),
        onError: (error) => notifications.show({ color: 'red', title: 'Run refused', message: error.message }),
      },
    )
  }

  async function runExecute() {
    if (!serverName || !workflow) return
    // Always preview first: it says whether the plan is destructive and hands back the token.
    const current = preview.data ?? (await preview.mutateAsync(buildRequest()).catch(() => null))
    if (!current) return // preview failed; its error is shown below
    if (current.checks.some((c) => c.result.blocking)) return // blocked by a preflight check; shown below
    // The whole checklist is confirmed ONCE, in a dialog that lists every statement.
    if (current.destructive) {
      setConfirming(true)
      return
    }
    sendExecute(current)
  }

  return (
    <Stack gap="md">
      <PageHeader title="Offboarding" description={workflow?.description ?? 'A guided checklist to remove a leaver’s access.'} />

      <TargetBar server={server} where="server level + every online database" summary={summary} />

      {(servers.isPending || workflows.isPending) && <Skeleton height={36} maw={320} />}
      {servers.isError && (
        <Alert color="red" variant="light">
          Could not load servers: {servers.error.message}
        </Alert>
      )}
      {workflows.isError && (
        <Alert color="red" variant="light">
          Could not load the checklist: {workflows.error.message}
        </Alert>
      )}

      {servers.data && workflow && (
        <>
          <Group align="flex-end" gap="sm">
            <Select
              label="Server"
              placeholder="Select a server…"
              w={260}
              data={servers.data.map((s) => s.name)}
              value={serverName}
              onChange={(next) => {
                setServerName(next)
                setParamValues({})
                resetPreview()
              }}
            />
            {server && (
              <div style={{ paddingBottom: 6 }}>
                <EnvBadge environment={server.environment} />
              </div>
            )}
          </Group>

          {serverName && (
            <Paper withBorder p="md">
              <Stack gap="md">
                <ParamForm
                  params={workflow.params}
                  values={paramValues}
                  onChange={(values) => {
                    setParamValues(values)
                    resetPreview()
                  }}
                  serverName={serverName}
                  database=""
                  onBlockedChange={setCannotFill}
                />

                <Checklist workflow={workflow} selected={selected} onToggle={toggle} result={execute.data?.steps} />

                {workflow.notes.length > 0 && (
                  <List size="xs" c="dimmed" spacing={2}>
                    {workflow.notes.map((n) => (
                      <List.Item key={n}>{n}</List.Item>
                    ))}
                  </List>
                )}

                <Group gap="sm" align="center">
                  <Button
                    variant="default"
                    leftSection={<IconSearch size={16} />}
                    onClick={() => preview.mutate(buildRequest())}
                    loading={preview.isPending}
                    disabled={cannotFill.length > 0}
                  >
                    Preview all steps
                  </Button>
                  <Button
                    color={pendingConfirm ? 'red' : undefined}
                    leftSection={<IconPlayerPlay size={16} />}
                    onClick={runExecute}
                    loading={execute.isPending}
                    disabled={preview.isPending || blocked || cannotFill.length > 0}
                  >
                    {targetLabel(pendingConfirm ? 'Review and run the checklist' : 'Run the checklist', server, leaver ? `[${leaver}]` : null)}
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

                <PreflightPanel checks={checks} />
                {preview.data?.impact && <ImpactReport impact={preview.data.impact} />}

                {preview.data && (
                  <Accordion variant="contained" multiple>
                    {preview.data.steps.map((s, i) => (
                      <Accordion.Item key={s.key} value={s.key}>
                        <Accordion.Control>
                          <Group gap="xs">
                            <Text size="sm" fw={500}>
                              {i + 1}. {s.title}
                            </Text>
                            {s.destructive && (
                              <Badge size="xs" color="red" variant="light">
                                destructive
                              </Badge>
                            )}
                          </Group>
                        </Accordion.Control>
                        <Accordion.Panel>
                          {/* Dry run: the exact statements. Steps without dry-run (the snapshot) show their query. */}
                          {s.statements ? (
                            <StatementList statements={s.statements} />
                          ) : (
                            <Code block style={{ whiteSpace: 'pre-wrap' }}>
                              {s.batches.join('\nGO\n')}
                            </Code>
                          )}
                        </Accordion.Panel>
                      </Accordion.Item>
                    ))}
                  </Accordion>
                )}

                {execute.data && <Results steps={execute.data.steps} warnings={execute.data.warnings} success={execute.data.success} />}
              </Stack>
            </Paper>
          )}
        </>
      )}

      {/* One confirmation for the whole checklist. */}
      <Modal
        opened={confirming && pendingConfirm !== null && !blocked}
        onClose={() => setConfirming(false)}
        title={
          <Text fw={700} c="red">
            ⚠ This runs {pendingConfirm?.steps.length ?? 0} steps and changes the server
          </Text>
        }
        size="lg"
        centered
      >
        <Stack gap="md">
          <Text size="sm">Review the steps and the recap, then confirm. A failed step stops the rest.</Text>
          {pendingConfirm && server && (
            <ConfirmRecap
              rows={[
                ['Server', `${server.name} (${server.environment})`],
                ['Login', leaver ? `[${leaver}]` : null],
                ['New owner', newOwner ? `[${newOwner}]` : null],
                ['Steps', pendingConfirm.steps.map((s) => s.title).join(' → ')],
                ['Statements', `${pendingConfirm.steps.reduce((n, s) => n + (s.statements?.length ?? 0), 0)} in total`],
                ['Will touch', touchedSummary(preview.data?.impact)],
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
              {targetLabel('Confirm and run the checklist', server, leaver ? `[${leaver}]` : null)}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}

/** "1 databases owned, 2 server roles" — the non-zero lines of the impact report, for the confirm recap. */
function touchedSummary(impact: LookupResult | null | undefined): string | null {
  if (!impact || impact.warning) return null
  const lines = impact.items
    .map((i) => ({ label: i.label.replace(/ \(.*\)$/, '').toLowerCase(), count: Number((i.extra as Record<string, unknown>).count ?? 0) }))
    .filter((i) => i.count > 0 && !i.label.startsWith('databases not online'))
    .map((i) => `${i.count} ${i.label}`)
  return lines.length > 0 ? lines.join(', ') : 'nothing owned or held by this login'
}

/** Dry-run report: how many sessions / jobs / databases / roles the run will touch, from the server. */
function ImpactReport({ impact }: { impact: LookupResult }) {
  if (impact.warning) {
    return (
      <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={18} />}>
        {impact.warning}
      </Alert>
    )
  }

  return (
    <Paper withBorder>
      <Text size="sm" fw={600} px="sm" py={6} style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
        What this run will touch
      </Text>
      <Table fz="sm" verticalSpacing={4} withRowBorders>
        <Table.Tbody>
          {impact.items.map((item) => {
            const count = Number((item.extra as Record<string, unknown>).count ?? 0)
            return (
              <Table.Tr key={item.value}>
                <Table.Td c="dimmed">{item.label}</Table.Td>
                <Table.Td ta="right" fw={count > 0 ? 600 : undefined} c={count > 0 ? undefined : 'dimmed'}>
                  {count}
                </Table.Td>
              </Table.Tr>
            )
          })}
        </Table.Tbody>
      </Table>
    </Paper>
  )
}

function defaultSelection(workflow: WorkflowSummary | undefined): Set<string> {
  return new Set(workflow?.steps.filter((s) => s.required || s.defaultOn).map((s) => s.key))
}

/** The ticks. After a run each row also shows its outcome, so the list doubles as progress. */
function Checklist({
  workflow,
  selected,
  onToggle,
  result,
}: {
  workflow: WorkflowSummary
  selected: Set<string>
  onToggle: (key: string) => void
  result: readonly WorkflowStepResult[] | undefined
}) {
  return (
    <Stack gap={6}>
      {workflow.steps.map((s, i) => {
        const outcome = result?.find((r) => r.key === s.key)
        return (
          <Group key={s.key} gap="sm" wrap="nowrap">
            <Checkbox
              checked={selected.has(s.key)}
              disabled={s.required}
              onChange={() => onToggle(s.key)}
              label={
                <Text span size="sm" c={selected.has(s.key) ? undefined : 'dimmed'}>
                  {i + 1}. {s.title}
                  {s.destructive && (
                    <Text span size="xs" c="red">
                      {' '}
                      ⚠
                    </Text>
                  )}
                  {s.needsNewOwner && (
                    <Text span size="xs" c="dimmed">
                      {' '}
                      (needs an owner — see "New owner" above)
                    </Text>
                  )}
                  {s.required && (
                    <Text span size="xs" c="dimmed">
                      {' '}
                      (always)
                    </Text>
                  )}
                </Text>
              }
            />
            {outcome && <StatusBadge status={outcome.status} />}
          </Group>
        )
      })}
    </Stack>
  )
}

function StatusBadge({ status }: { status: string }) {
  const color = status === 'OK' ? 'green' : status === 'FAILED' ? 'red' : 'gray'
  return (
    <Badge size="sm" color={color} variant="light">
      {status === 'NOT_RUN' ? 'not run' : status}
    </Badge>
  )
}

/** Per-step detail after a run: error, snapshot file, per-database log and result grids. */
function Results({
  steps,
  warnings,
  success,
}: {
  steps: readonly WorkflowStepResult[]
  warnings: readonly string[]
  success: boolean
}) {
  const ran = steps.filter((s) => s.status !== 'NOT_RUN')
  return (
    <Stack gap="sm">
      <Alert color={success ? 'green' : 'red'} variant="light">
        {success ? 'All steps finished.' : 'Stopped at the first failed step; later steps did not run.'}
      </Alert>

      {warnings.map((w) => (
        <Alert key={w} color="yellow" variant="light" icon={<IconAlertTriangle size={18} />}>
          {w}
        </Alert>
      ))}

      {/* A failed step starts open, so the error is never hidden. */}
      <Accordion variant="contained" multiple defaultValue={ran.filter((s) => s.status === 'FAILED').map((s) => s.key)}>
        {ran.map((s) => (
          <Accordion.Item key={s.key} value={s.key}>
            <Accordion.Control>
              <Group gap="xs">
                <Text size="sm" fw={500}>
                  {s.title}
                </Text>
                <StatusBadge status={s.status} />
                <Text size="xs" c="dimmed">
                  {s.elapsedMs} ms
                </Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                {s.snapshotPath && (
                  <Alert color="green" variant="light">
                    Snapshot saved: <Code>{s.snapshotPath}</Code>
                  </Alert>
                )}
                {s.steps && <StepLog steps={[...s.steps]} />}
                <ResultsGrid
                  result={{ success: s.status === 'OK', resultSets: s.resultSets, messages: s.messages, error: s.error }}
                  exportName={`offboarding ${s.key}`}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </Stack>
  )
}
