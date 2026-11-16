import { Group, Stack, Text, Title } from '@mantine/core'
import type { ReactNode } from 'react'

/**
 * Title row at the top of every page: the page name, one line saying what the page is for, and an optional
 * slot on the right for page-level actions. One component, so all pages start the same way.
 */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <Group justify="space-between" align="flex-end" mb="md" wrap="nowrap">
      <Stack gap={2}>
        {/* The app name in the header is the <h1>; each page title is an <h2>. */}
        <Title order={2} size="h3">
          {title}
        </Title>
        {description && (
          <Text size="sm" c="dimmed">
            {description}
          </Text>
        )}
      </Stack>
      {actions}
    </Group>
  )
}
