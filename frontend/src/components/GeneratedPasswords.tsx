import { ActionIcon, Alert, Code, CopyButton, Group, Stack, Text, Tooltip } from '@mantine/core'
import { IconCheck, IconCopy, IconKey } from '@tabler/icons-react'

/**
 * Shows server-generated passwords once. They are not stored or logged anywhere (the audit log
 * keeps "***"), so this panel is the only copy: it disappears when the result is replaced.
 */
export function GeneratedPasswords({ passwords }: { passwords: Record<string, string> }) {
  return (
    <Alert color="yellow" variant="light" icon={<IconKey size={18} />} title="Generated password — shown once. Copy it now; it is not stored anywhere.">
      <Stack gap="xs">
        {Object.entries(passwords).map(([name, value]) => (
          <Group key={name} gap="sm" wrap="nowrap">
            <Text size="sm">{name}</Text>
            <Code fz="sm" style={{ userSelect: 'all' }}>
              {value}
            </Code>
            <CopyButton value={value}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? 'Copied' : 'Copy'}>
                  <ActionIcon variant="default" size="md" onClick={copy} aria-label={`Copy the ${name}`}>
                    {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          </Group>
        ))}
      </Stack>
    </Alert>
  )
}
