import { Anchor, Text } from '@mantine/core'
import type { LookupState } from './lookupState'

/**
 * Why a lookup-driven control has no list to offer (nothing on the server, no permission, not available for
 * this engine, something else must be chosen first), with a Retry link for failures that may pass.
 * One component, so the explanation reads the same under a picker and inside a checklist.
 */
export function LookupNotice({ state, suffix }: { state: LookupState; suffix?: string }) {
  if (!state.reason) return null
  return (
    <Text size="xs" c={state.status === 'unavailable' ? 'orange' : 'dimmed'} mt={2}>
      {state.reason}
      {suffix && ` ${suffix}`}
      {state.retryable && (
        <Anchor component="button" type="button" size="xs" ml="xs" onClick={state.retry}>
          Retry
        </Anchor>
      )}
    </Text>
  )
}
