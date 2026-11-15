import { useEffect, useState } from 'react'
import type { OperationParameter } from '../api/operations'
import { encodeList, parseList, splitNames } from './lookupText'
import type { BlockReporter } from './lookupState'

/**
 * A list parameter the DBA TYPES (YAML `typed_list: true`), for things that do not exist on the server yet,
 * e.g. the names of logins to create. One name per line; pasting a column from a spreadsheet works.
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

  return (
    <div className="rounded border border-slate-200 text-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-3 py-1.5">
        <span className="font-medium text-slate-700">
          {param.label ?? param.name.replaceAll('_', ' ')}
          {param.required && <span className="text-red-600"> *</span>}
        </span>
        <span className="text-xs text-slate-500">
          {names.length} name{names.length === 1 ? '' : 's'}
        </span>
      </div>
      {param.help && <p className="px-3 pt-1 text-xs text-slate-500">{param.help}</p>}
      <div className="px-3 py-1.5">
        <textarea
          value={text}
          rows={6}
          spellCheck={false}
          autoComplete="off"
          placeholder={'one name per line\napp_reports\napp_billing'}
          onChange={(e) => {
            setText(e.target.value)
            onChange(encodeList(splitNames(e.target.value)))
          }}
          className="w-full max-w-md rounded border border-slate-300 px-2 py-1.5 font-mono text-xs"
        />
      </div>
    </div>
  )
}
