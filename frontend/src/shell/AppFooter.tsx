import { Anchor, Divider, Group, Text } from '@mantine/core'
import { Link } from 'react-router'
import { usePing } from '../api/ping'

/**
 * Footer at the bottom of every page: what this is, which build and environment the API reports, and
 * the places to look for help. It is part of the page flow (not a fixed bar), so it never covers content:
 * on a short page it sits at the bottom of the window, on a long one it comes after the content.
 * The version and environment come from the same /api/ping answer as the header badge (shared cache).
 */
export function AppFooter() {
  const ping = usePing()

  return (
    <footer style={{ marginTop: 'var(--mantine-spacing-xl)' }}>
      <Divider mb="xs" />
      <Group justify="space-between" gap="xs" wrap="wrap">
        <Text size="xs" c="dimmed">
          SQL Admin Console
          {ping.data ? ` · v${ping.data.version} · ${ping.data.environment}` : ''}
          {' · '}runs locally, audit log kept on this machine
        </Text>
        <Group gap="md">
          <Anchor component={Link} to="/docs" size="xs">
            Documentation
          </Anchor>
          <Anchor component={Link} to="/audit" size="xs">
            Audit log
          </Anchor>
        </Group>
      </Group>
    </footer>
  )
}
