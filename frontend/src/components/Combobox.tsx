import { useId, useState } from 'react'

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
 * Text input with a list of suggestions, written for this app instead of a native `<datalist>`:
 * the option is always the real name (hints sit beside it, never replace it), the full list is shown on focus
 * (it is only narrowed once the DBA types), and the browser's password manager cannot hijack it.
 * Free typing stays possible; whether an unknown value is acceptable is the caller's rule.
 * Follows the WAI-ARIA combobox pattern: ↓/↑ move, Enter picks, Esc closes.
 */
export function Combobox({
  value,
  onChange,
  items,
  disabled = false,
  placeholder,
  invalid = false,
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  items: readonly ComboItem[]
  disabled?: boolean
  placeholder?: string
  invalid?: boolean
  className?: string
}) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  // Narrow the list only after the DBA has typed: opening it with a value in the box must still show everything.
  const [typed, setTyped] = useState(false)

  const needle = value.trim().toLowerCase()
  const shown = typed && needle ? items.filter((i) => `${i.value} ${i.hint ?? ''}`.toLowerCase().includes(needle)) : items

  function pick(item: ComboItem) {
    if (item.locked) return
    onChange(item.value)
    setOpen(false)
    setTyped(false)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(i + 1, shown.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && open && shown[active]) {
      e.preventDefault()
      pick(shown[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const border = invalid ? 'border-red-500 bg-red-50' : 'border-slate-300'

  return (
    <div className="relative">
      <div className="flex">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={invalid || undefined}
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore="true"
          spellCheck={false}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value)
            setTyped(true)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => {
            setTyped(false)
            setOpen(true)
          }}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className={`rounded-l border px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ${border} ${className}`}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Show the list"
          disabled={disabled || items.length === 0}
          onMouseDown={(e) => {
            e.preventDefault() // keep the input focused
            setTyped(false)
            setOpen((o) => !o)
          }}
          className={`rounded-r border border-l-0 px-2 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-40 ${border}`}
        >
          ▾
        </button>
      </div>

      {open && !disabled && shown.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full min-w-72 overflow-auto rounded border border-slate-300 bg-white py-1 text-sm shadow-lg"
        >
          {shown.map((item, i) => (
            <li
              key={item.value}
              role="option"
              aria-selected={item.value === value}
              aria-disabled={item.locked ? true : undefined}
              title={item.locked ?? item.description}
              onMouseDown={(e) => {
                e.preventDefault() // pick before the input loses focus
                pick(item)
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex items-baseline gap-2 px-2 py-1 ${i === active ? 'bg-slate-100' : ''} ${
                item.locked ? 'cursor-not-allowed text-slate-400' : 'cursor-pointer'
              }`}
            >
              <span className="font-mono text-xs">{item.value}</span>
              {item.locked && <span className="text-xs">🔒 {item.locked}</span>}
              {item.hint && !item.locked && <span className="truncate text-xs text-slate-500">{item.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
