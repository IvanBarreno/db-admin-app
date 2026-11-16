import { Textarea } from '@mantine/core'
import { useEffect, useState } from 'react'
import type { OperationParameter } from '../api/operations'
import { fieldProps } from './fieldKit'
import { encodeList, parseList, splitNames } from './lookupText'
import type { BlockReporter } from './lookupState'

/**
 * A list parameter the DBA TYPES (YAML `typed_list: true`), for things that do not exist on the server yet.
 * One name per line; pasting a column from a spreadsheet works.
 *
 * (A typed list that comes with one password per item — creating several logins — is drawn by PasswordRows
 * instead, one row per name. This plain box is for typed lists without passwords.)
 *
 * The form's value for a list is a JSON array (see encodeList), which is awkward to type in, so this component
 * keeps the raw text in its own state and reports the parsed names upwards on every keystroke.
 */
export function TypedList({
  param,
  value,
  onChange,
  onBlock,
}: {
  param: OperationParameter
  value: string
  onChange: (value: string) => void
  onBlock?: BlockReporter
}) {
  // Start from the form's value (names joined by line breaks) so a value that is already there is shown.
  const [text, setText] = useState(() => parseList(value).join('\n'))
  const names = splitNames(text)

  // The form can be cleared from outside (another server was chosen): the box must empty too. React's
  // pattern for "reset state when a prop changes" is to remember the previous prop and compare DURING
  // render — no effect needed, and no extra paint with stale text.
  const [previousValue, setPreviousValue] = useState(value)
  if (value !== previousValue) {
    setPreviousValue(value)
    if (value === '' && names.length > 0) setText('')
  }

  // A required list with nothing in it keeps Preview / Execute off, with the reason next to the button.
  const blocking = param.required && names.length === 0 ? `Type at least one name in "${param.label ?? param.name}".` : null
  useEffect(() => {
    onBlock?.(param.name, blocking)
    return () => onBlock?.(param.name, null)
  }, [onBlock, param.name, blocking])

  const props = fieldProps(param)

  return (
    <Textarea
      {...props}
      // The counter rides along with the help text, under the box.
      description={[`${names.length} name${names.length === 1 ? '' : 's'}`, param.help].filter(Boolean).join(' · ')}
      value={text}
      // autosize: the box grows with its content between minRows and maxRows.
      autosize
      minRows={4}
      maxRows={12}
      maw={420}
      spellCheck={false}
      autoComplete="off"
      placeholder={'one name per line\napp_reports\napp_billing'}
      styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 'var(--mantine-font-size-xs)' } }}
      onChange={(event) => {
        setText(event.currentTarget.value)
        onChange(encodeList(splitNames(event.currentTarget.value)))
      }}
    />
  )
}
