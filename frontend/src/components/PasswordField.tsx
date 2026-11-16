import { ActionIcon, Button, CopyButton, Group, Input, PasswordInput, Tooltip } from '@mantine/core'
import { IconCheck, IconCopy, IconWand } from '@tabler/icons-react'
import { useState, type ReactNode } from 'react'
import { WRAPPER_ORDER } from './fieldKit'
import { PasswordGeneratorModal } from './PasswordGeneratorModal'

/**
 * THE password input of the app: every place that asks for a password uses this component, so each one has
 * the same three tools — show / hide (the eye inside the field), copy, and **Generate…**, which opens the
 * generator modal (length, character classes, look-alikes, save as default).
 *
 * A generated password lands in the field BEFORE the run and is shown, so it can be checked and copied
 * first. Leaving the field empty is allowed where the server can generate one at run time; the placeholder
 * says so.
 *
 * `compact` drops the label / help and shortens the button to an icon: for one row of a list of logins.
 */
export function PasswordField({
  value,
  onChange,
  label,
  description,
  error,
  required = false,
  placeholder,
  compact = false,
  generatorTitle,
  ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  label?: ReactNode
  /** Help text under the field. */
  description?: ReactNode
  error?: ReactNode
  required?: boolean
  placeholder?: string
  compact?: boolean
  /** Title of the generator modal, e.g. "Password for [app_reports]". */
  generatorTitle?: string
  /** Name for screen readers when there is no visible label (compact rows). */
  ariaLabel?: string
}) {
  const [visible, setVisible] = useState(false)
  const [generating, setGenerating] = useState(false)

  const controls = (
    <Group gap="xs" wrap="nowrap" align="center">
      <PasswordInput
        style={{ flex: 1, minWidth: compact ? 180 : 240 }}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        // Controlled visibility: the eye button toggles it, and "use this password" turns it on.
        visible={visible}
        onVisibilityChange={setVisible}
        placeholder={placeholder}
        error={error !== undefined && error !== null && error !== false}
        aria-label={ariaLabel}
        // "new-password" tells browsers this is not a login form: do not offer to fill a saved password.
        autoComplete="new-password"
        styles={{ innerInput: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
      />
      <CopyButton value={value}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? 'Copied' : 'Copy'}>
            <ActionIcon variant="default" size="lg" onClick={copy} disabled={!value} aria-label="Copy the password">
              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
      {compact ? (
        <Tooltip label="Generate with options…">
          <ActionIcon variant="default" size="lg" onClick={() => setGenerating(true)} aria-label="Generate a password with options">
            <IconWand size={16} />
          </ActionIcon>
        </Tooltip>
      ) : (
        <Button variant="default" leftSection={<IconWand size={16} />} onClick={() => setGenerating(true)}>
          Generate…
        </Button>
      )}
    </Group>
  )

  return (
    <>
      {compact ? (
        controls
      ) : (
        // Input.Wrapper draws label / help / error around ANY content, here a field plus its buttons.
        <Input.Wrapper label={label} description={description} error={error} withAsterisk={required} inputWrapperOrder={WRAPPER_ORDER}>
          {controls}
        </Input.Wrapper>
      )}

      {generating && (
        <PasswordGeneratorModal
          title={generatorTitle}
          onClose={() => setGenerating(false)}
          onUse={(password) => {
            onChange(password)
            setVisible(true) // show what was generated so it can be checked and copied
            setGenerating(false)
          }}
        />
      )}
    </>
  )
}
