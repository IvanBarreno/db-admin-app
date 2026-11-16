import { Alert, Stack, Text } from '@mantine/core'
import { IconAlertTriangle, IconCircleX } from '@tabler/icons-react'
import type { Schema } from '../api/client'

export type CheckResult = Schema<'CheckResult'>

/** A check result optionally tagged with the workflow step it belongs to. */
export type PanelCheck = CheckResult & { stepTitle?: string }

/**
 * Outcome of the preflight checks (YAML `checks:`) from a preview. Blocking failures are red and stop
 * the run (the server also refuses it); warnings are amber and informational; passed checks are
 * collapsed into one line so the panel stays quiet when everything is fine.
 */
export function PreflightPanel({ checks }: { checks: readonly PanelCheck[] | null | undefined }) {
  if (!checks || checks.length === 0) return null

  const failed = checks.filter((c) => !c.ok)
  const passed = checks.length - failed.length

  return (
    <Stack gap={6}>
      {failed.map((c, i) => (
        <Alert
          key={`${c.stepTitle ?? ''}${c.id}${i}`}
          color={c.blocking ? 'red' : 'yellow'}
          variant="light"
          icon={c.blocking ? <IconCircleX size={18} /> : <IconAlertTriangle size={18} />}
          title={c.blocking ? 'Blocked' : 'Warning'}
          p="xs"
        >
          {c.stepTitle && (
            <Text span size="xs" c="dimmed">
              {c.stepTitle} ·{' '}
            </Text>
          )}
          {c.message}
        </Alert>
      ))}
      {passed > 0 && (
        <Text size="xs" c="green">
          ✓ {passed} preflight {passed === 1 ? 'check' : 'checks'} passed
        </Text>
      )}
    </Stack>
  )
}
