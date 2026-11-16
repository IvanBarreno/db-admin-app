import { Group, Combobox as MantineCombobox, ScrollArea, Text, TextInput, useCombobox } from '@mantine/core'
import { useState, type ReactNode } from 'react'
import { WRAPPER_ORDER } from './fieldKit'

/** One suggestion: the real name, a muted hint beside it, and optionally a lock (a row that cannot be chosen). */
export interface ComboItem {
  value: string
  /** Facts from the server (type, owner, disabled…), shown muted after the name. */
  hint?: string
  /** Tooltip with a longer explanation. */
  description?: string
  /** Set = the row is shown but cannot be picked; the text says why (e.g. "view only — the account this app connects with"). */
  locked?: string
}

/**
 * Text input with a list of suggestions, for picking a login / user / database / role by name.
 *
 * Built on Mantine's Combobox PRIMITIVES rather than its ready-made Select / Autocomplete, because this
 * field has rules those do not offer together:
 *   - the option is always the real name, with the server's facts as a muted hint beside it;
 *   - focusing the field shows the WHOLE list, even with a value already in the box — it is only narrowed
 *     once the DBA types (a prefilled "bob" must not make it look as if only bob exists);
 *   - a row can be locked: visible, with the reason, but not pickable;
 *   - free typing stays possible; whether an unknown value is acceptable is the caller's rule.
 * Mantine handles the hard parts: positioning the dropdown, ↓ / ↑ / Enter / Esc, ARIA attributes.
 *
 * `useCombobox()` returns the "store": the dropdown's open/closed state and which option is highlighted.
 */
export function Combobox({
  value,
  onChange,
  items,
  disabled = false,
  placeholder,
  invalid = false,
  className,
  label,
  description,
  error,
  required = false,
  w,
}: {
  value: string
  onChange: (value: string) => void
  items: readonly ComboItem[]
  disabled?: boolean
  placeholder?: string
  /** Red border without a message (the caller prints its own explanation). */
  invalid?: boolean
  className?: string
  label?: ReactNode
  /** Help text under the field. */
  description?: ReactNode
  /** Error message under the field (also turns the border red). */
  error?: ReactNode
  required?: boolean
  /** Width, as a number of px or any CSS width. */
  w?: number | string
}) {
  const combobox = useCombobox({
    // Forget the highlighted row when the list closes, so the next opening starts from the top.
    onDropdownClose: () => combobox.resetSelectedOption(),
  })
  // Narrow the list only after the DBA has typed: opening it with a value in the box must still show everything.
  const [typed, setTyped] = useState(false)

  const needle = value.trim().toLowerCase()
  const shown = typed && needle ? items.filter((i) => `${i.value} ${i.hint ?? ''}`.toLowerCase().includes(needle)) : items

  return (
    <MantineCombobox
      store={combobox}
      // Fires on a click on an option or Enter on the highlighted one. Locked options are `disabled`,
      // so Mantine never submits them.
      onOptionSubmit={(picked) => {
        onChange(picked)
        setTyped(false)
        combobox.closeDropdown()
      }}
    >
      {/* Target = the element the dropdown is attached to and that receives the keyboard handlers. */}
      <MantineCombobox.Target>
        <TextInput
          label={label}
          description={description}
          error={error ?? invalid}
          withAsterisk={required}
          inputWrapperOrder={WRAPPER_ORDER}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          className={className}
          w={w}
          // Keep the browser's autofill and password managers away: next to a password field Chrome would
          // otherwise replace this list with its saved-credentials popup.
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore="true"
          spellCheck={false}
          rightSection={<MantineCombobox.Chevron />}
          rightSectionPointerEvents="none"
          onChange={(event) => {
            onChange(event.currentTarget.value)
            setTyped(true)
            combobox.openDropdown()
            combobox.updateSelectedOptionIndex() // highlight the first match of what was typed
          }}
          // A disabled field must never open its list (browsers do not focus it, but be explicit).
          onFocus={() => {
            if (disabled) return
            setTyped(false)
            combobox.openDropdown()
          }}
          onClick={() => !disabled && combobox.openDropdown()}
          onBlur={() => combobox.closeDropdown()}
        />
      </MantineCombobox.Target>

      {/* hidden: no empty box when nothing matches (free typing continues). */}
      <MantineCombobox.Dropdown hidden={shown.length === 0}>
        <MantineCombobox.Options>
          {/* Autosize: as tall as its rows up to `mah`, then it scrolls. */}
          <ScrollArea.Autosize mah={260} type="scroll">
            {shown.map((item) => (
              <MantineCombobox.Option
                key={item.value}
                value={item.value}
                disabled={item.locked !== undefined}
                active={item.value === value}
                title={item.locked ?? item.description}
              >
                <Group gap="xs" wrap="nowrap">
                  <Text size="xs" ff="monospace" style={{ whiteSpace: 'nowrap' }}>
                    {item.value}
                  </Text>
                  {item.locked && (
                    <Text size="xs" c="dimmed">
                      🔒 {item.locked}
                    </Text>
                  )}
                  {item.hint && !item.locked && (
                    <Text size="xs" c="dimmed" truncate>
                      {item.hint}
                    </Text>
                  )}
                </Group>
              </MantineCombobox.Option>
            ))}
          </ScrollArea.Autosize>
        </MantineCombobox.Options>
      </MantineCombobox.Dropdown>
    </MantineCombobox>
  )
}
