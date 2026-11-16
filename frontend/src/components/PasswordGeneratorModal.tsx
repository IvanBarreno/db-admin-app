import { ActionIcon, Alert, Anchor, Button, Checkbox, Code, CopyButton, Divider, Group, Modal, NumberInput, SimpleGrid, Slider, Stack, Text, Tooltip } from '@mantine/core'
import { IconCheck, IconCopy, IconRefresh } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { useGeneratePassword } from '../api/secrets'
import {
  FACTORY_PASSWORD_SETTINGS,
  clampLength,
  loadPasswordSettings,
  savePasswordSettings,
  type PasswordSettings,
} from './passwordSettings'

/**
 * Modal to generate a password with chosen options and hand it to the form field BEFORE the operation
 * runs, so the DBA can read, copy and (if needed) retype it. It opens on the app-wide defaults; changes
 * here apply to this password only, unless "save as default" is ticked.
 *
 * Mount it only while it is needed (`{open && <PasswordGeneratorModal … />}`): every mount starts from the
 * saved defaults and generates a fresh password. Mantine's Modal provides the focus trap, Esc to close,
 * the backdrop, and renders in a portal (outside the form), so clicks in it never reach the field's label.
 */
export function PasswordGeneratorModal({
  onUse,
  onClose,
  title = 'Generate password',
}: {
  onUse: (password: string) => void
  onClose: () => void
  /** E.g. "Password for [app_reports]" when the modal is opened from one row of a list. */
  title?: string
}) {
  const [settings, setSettings] = useState<PasswordSettings>(loadPasswordSettings)
  const [saveAsDefault, setSaveAsDefault] = useState(false)
  const generate = useGeneratePassword()

  const classCount = [settings.upper, settings.lower, settings.digits, settings.symbols].filter(Boolean).length
  const password = generate.data?.password ?? ''

  // Generate on open and whenever an option changes (the key stands for "the options as a value").
  const optionsKey = JSON.stringify(settings)
  const { mutate } = generate
  useEffect(() => {
    if (classCount === 0) return
    mutate(JSON.parse(optionsKey) as PasswordSettings)
  }, [optionsKey, classCount, mutate])

  function change(patch: Partial<PasswordSettings>) {
    setSettings((current) => ({ ...current, ...patch }))
  }

  function use() {
    if (saveAsDefault) savePasswordSettings(settings)
    onUse(password)
  }

  return (
    <Modal opened onClose={onClose} title={title} centered size="md">
      <Stack gap="md">
        <Stack gap={4}>
          <Group gap="xs" wrap="nowrap" align="stretch">
            {/* block: a full-width box instead of inline code, so a long password wraps inside it. */}
            <Code block style={{ flex: 1, minHeight: 36, wordBreak: 'break-all', whiteSpace: 'pre-wrap', userSelect: 'all' }}>
              {generate.isPending && !password ? '…' : password}
            </Code>
            {/* CopyButton owns the "copied" state: `copied` stays true for a moment after `copy()`. */}
            <CopyButton value={password}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? 'Copied' : 'Copy'}>
                  <ActionIcon variant="default" size="lg" onClick={copy} disabled={!password} aria-label="Copy the password">
                    {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
            <Tooltip label="Another one with the same options">
              <ActionIcon
                variant="default"
                size="lg"
                onClick={() => mutate(settings)}
                disabled={classCount === 0}
                loading={generate.isPending}
                aria-label="Generate another password"
              >
                <IconRefresh size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
          {generate.isError && (
            <Text size="sm" c="red">
              {generate.error.message}
            </Text>
          )}
          {classCount === 0 && (
            <Text size="sm" c="red">
              Choose at least one kind of character.
            </Text>
          )}
          {generate.data?.warning && (
            <Alert color="yellow" variant="light" p="xs">
              {generate.data.warning}
            </Alert>
          )}
        </Stack>

        <Stack gap="xs">
          <Group gap="md" wrap="nowrap" align="center">
            <Text size="sm" w={56}>
              Length
            </Text>
            <Slider
              style={{ flex: 1 }}
              min={12}
              max={128}
              value={settings.length}
              onChange={(length) => change({ length: clampLength(length) })}
              label={null}
              aria-label="Password length"
            />
            <NumberInput
              w={84}
              min={12}
              max={128}
              allowDecimal={false}
              value={settings.length}
              // NumberInput reports a number, or a string while the text is not a number yet (e.g. empty).
              onChange={(length) => typeof length === 'number' && change({ length: clampLength(length) })}
              aria-label="Password length"
            />
          </Group>

          <SimpleGrid cols={2} spacing="xs" verticalSpacing={6}>
            <Checkbox label="Upper case (A-Z)" checked={settings.upper} onChange={(e) => change({ upper: e.currentTarget.checked })} />
            <Checkbox label="Lower case (a-z)" checked={settings.lower} onChange={(e) => change({ lower: e.currentTarget.checked })} />
            <Checkbox label="Digits (0-9)" checked={settings.digits} onChange={(e) => change({ digits: e.currentTarget.checked })} />
            <Checkbox label="Symbols (!#$%…)" checked={settings.symbols} onChange={(e) => change({ symbols: e.currentTarget.checked })} />
          </SimpleGrid>
          <Checkbox
            label="Exclude look-alikes (0 O 1 l I)"
            checked={settings.excludeLookalikes}
            onChange={(e) => change({ excludeLookalikes: e.currentTarget.checked })}
          />
        </Stack>

        <Divider />

        <Stack gap={6}>
          <Checkbox
            label="Save these options as the default for the whole app"
            checked={saveAsDefault}
            onChange={(e) => setSaveAsDefault(e.currentTarget.checked)}
          />
          <Anchor
            component="button"
            type="button"
            size="xs"
            c="dimmed"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => {
              setSettings(FACTORY_PASSWORD_SETTINGS)
              setSaveAsDefault(false)
            }}
          >
            Reset to factory options
          </Anchor>
        </Stack>

        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={use} disabled={!password || generate.isPending || classCount === 0}>
            Use this password
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
