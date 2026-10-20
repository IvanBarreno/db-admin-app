import { useEffect, useRef, useState } from 'react'
import type { OperationParameter } from '../api/operations'
import { useLookup } from '../api/lookups'
import { lookupHint } from './lookupText'
import { MultiChecklist } from './MultiChecklist'
import { PasswordGeneratorModal } from './PasswordGeneratorModal'
import { RoleChecklist } from './RoleChecklist'

/**
 * Renders one input per operation parameter, picking the control by its declared type.
 * `values` is keyed by parameter name; `onChange` receives the full updated map so the
 * parent can hold a single piece of state regardless of how many parameters there are.
 */
export function ParamForm({
  params,
  values,
  onChange,
  serverName,
  database,
}: {
  params: readonly OperationParameter[]
  values: Record<string, string>
  onChange: (values: Record<string, string>) => void
  /** Needed by the lookup pickers to know where to fetch names from. */
  serverName: string | null
  /** Selected database ('' = none); database-scoped lookups (users, roles...) need one. */
  database: string
}) {
  function set(name: string, value: string) {
    onChange({ ...values, [name]: value })
  }

  const doneGroups = new Set<string>()

  return (
    <div className="flex flex-wrap items-end gap-3">
      {params.map((param) => {
        // Two list parameters of one checklist group (add / drop) are ONE checklist of the principal's roles.
        if (param.checklistGroup) {
          if (doneGroups.has(param.checklistGroup)) return null
          doneGroups.add(param.checklistGroup)
          const addParam = params.find((p) => p.checklistGroup === param.checklistGroup && p.checklistAction === 'add')
          const dropParam = params.find((p) => p.checklistGroup === param.checklistGroup && p.checklistAction === 'drop')
          if (!addParam || !dropParam) return null
          return (
            <div key={`group-${param.checklistGroup}`} className="w-full">
              <RoleChecklist
                addParam={addParam}
                dropParam={dropParam}
                values={values}
                onChange={(patch) => onChange({ ...values, ...patch })}
                serverName={serverName}
                database={database}
              />
            </div>
          )
        }

        // Other lists: a checklist of what the server offers.
        if (param.multi) {
          return (
            <div key={param.name} className="w-full">
              <MultiChecklist
                param={param}
                value={values[param.name] ?? ''}
                onChange={(v) => set(param.name, v)}
                serverName={serverName}
                database={database}
                values={values}
              />
            </div>
          )
        }

        return (
          <label key={param.name} className="text-sm">
            <span className="mb-1 block text-slate-600">
              {param.name}
              {param.required && <span className="text-red-600"> *</span>}
            </span>
            <ParamInput
              param={param}
              value={values[param.name] ?? ''}
              onChange={(v) => set(param.name, v)}
              serverName={serverName}
              database={database}
              values={values}
            />
          </label>
        )
      })}
    </div>
  )
}

/**
 * Choice whose value can be proposed by the server (`suggest:` in the YAML): e.g. ENABLE / DISABLE is
 * preselected from the login's current state, and the state is shown. A field the DBA has already
 * changed is left alone.
 */
function SuggestedChoice({
  param,
  value,
  onChange,
  className,
  serverName,
  database,
  values,
}: {
  param: OperationParameter
  value: string
  onChange: (value: string) => void
  className: string
  serverName: string | null
  database: string
  values: Record<string, string>
}) {
  const suggest = param.suggest!
  const args: Record<string, string> = {}
  for (const name of suggest.dependsOn) args[name] = values[name] ?? ''
  const ready = Object.values(args).every((v) => v !== '')

  const query = useLookup(ready ? serverName : null, suggest.lookup, { database, args })
  const raw = query.data?.items[0]?.extra[suggest.column]
  const rawText = raw === undefined || raw === null ? null : String(raw)
  const suggested = rawText === null ? null : (suggest.map[rawText] ?? null)

  // Apply the proposal once per proposed value, and only over a blank field.
  const applied = useRef<string | null>(null)
  useEffect(() => {
    if (suggested !== null && applied.current !== suggested && value === '') {
      applied.current = suggested
      onChange(suggested)
    }
  }, [suggested, value, onChange])

  return (
    <>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
        <option value="">Select…</option>
        {param.choices?.map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
      </select>
      {suggested !== null && (
        <span className="mt-0.5 block text-xs text-slate-500">
          Server says {suggest.column} = {rawText}
          {value !== suggested && ` → suggested ${suggested}`}
        </span>
      )}
    </>
  )
}

function ParamInput({
  param,
  value,
  onChange,
  serverName,
  database,
  values,
}: {
  param: OperationParameter
  value: string
  onChange: (value: string) => void
  serverName: string | null
  database: string
  values: Record<string, string>
}) {
  const className = 'rounded border border-slate-300 px-2 py-1.5 text-sm'

  switch (param.type) {
    case 'Bool':
      return (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
          <option value="">—</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      )

    case 'Choice':
      if (param.suggest) {
        return (
          <SuggestedChoice
            param={param}
            value={value}
            onChange={onChange}
            className={className}
            serverName={serverName}
            database={database}
            values={values}
          />
        )
      }
      return (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
          <option value="">Select…</option>
          {param.choices?.map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
      )

    case 'Password':
      return <PasswordInput param={param} value={value} onChange={onChange} className={className} />


    case 'Int':
      return <input type="number" value={value} onChange={(e) => onChange(e.target.value)} className={className} />

    default:
      // Login / User / Database (implicit source) or any string-like parameter with `source:` in the YAML.
      if (param.effectiveSource) {
        return (
          <LookupInput
            param={param}
            value={value}
            onChange={onChange}
            className={className}
            serverName={serverName}
            database={database}
            values={values}
          />
        )
      }
      // Sysname, String — plain text.
      return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={className} />
  }
}

/**
 * Password field: hidden by default, with Show / Copy and a "Generate…" button that opens the generator
 * modal. A generated password lands in the field BEFORE the run, so it can be read and copied first.
 * Leaving a `generate: true` field blank still works: the server then generates one at execute time.
 */
function PasswordInput({
  param,
  value,
  onChange,
  className,
}: {
  param: OperationParameter
  value: string
  onChange: (value: string) => void
  className: string
}) {
  const [shown, setShown] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const small = 'rounded border border-slate-300 px-2 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50'

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      // Clipboard can be blocked (non-secure context); "Show" lets the DBA select it by hand.
    }
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <input
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setCopied(false)
          }}
          placeholder={param.generate ? 'blank = generate on run' : undefined}
          autoComplete="new-password"
          className={`${className} font-mono`}
        />
        <button type="button" onClick={() => setShown(!shown)} className={small}>
          {shown ? 'Hide' : 'Show'}
        </button>
        <button type="button" onClick={copy} disabled={!value} className={small}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" onClick={() => setGenerating(true)} className={small}>
          Generate…
        </button>
      </div>
      {generating && (
        <PasswordGeneratorModal
          onClose={() => setGenerating(false)}
          onUse={(password) => {
            onChange(password)
            setShown(true) // show what was generated so it can be checked and copied
            setCopied(false)
            setGenerating(false)
          }}
        />
      )}
    </>
  )
}

/**
 * Input fed by a server-side lookup. A `<datalist>` (not a `<select>`) keeps free typing possible:
 * the list can be empty (no permission on the catalog, Azure without master access) or the DBA may
 * want a name that doesn't exist yet. With `must_exist` the field turns red when the typed value is
 * not in the list; the API enforces the same rule, so this is feedback, not the guard.
 */
function LookupInput({
  param,
  value,
  onChange,
  className,
  serverName,
  database,
  values,
}: {
  param: OperationParameter
  value: string
  onChange: (value: string) => void
  className: string
  serverName: string | null
  database: string
  values: Record<string, string>
}) {
  // Values of the parameters this list depends on (e.g. the login whose roles are ticked).
  const args: Record<string, string> = {}
  for (const name of param.dependsOn ?? []) args[name] = values[name] ?? ''

  const query = useLookup(serverName, param.effectiveSource ?? null, { database, args })
  const items = query.data?.items ?? []
  const warning = query.data?.warning ?? null
  const listId = `lookup-${param.name}`

  // A database-scoped lookup asked without a database answers 400; say what is missing instead of "error".
  const needsDatabase = query.isError && !database
  const loading = query.isPending && query.fetchStatus !== 'idle'
  const listUsable = query.isSuccess && !warning

  const unknown = param.mustExist && listUsable && value !== '' && !items.some((i) => i.value.toLowerCase() === value.toLowerCase())

  const placeholder = needsDatabase
    ? 'select a database first'
    : loading
      ? 'loading…'
      : query.isError || warning
        ? 'list unavailable — type a name'
        : undefined

  return (
    <>
      <input
        type="text"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={unknown || undefined}
        className={unknown ? `${className} border-red-500 bg-red-50` : className}
      />
      <datalist id={listId}>
        {items.map((item) => (
          <option key={item.value} value={item.value} label={lookupHint(item)} />
        ))}
      </datalist>
      {unknown && <span className="mt-0.5 block text-xs text-red-600">not found on this server</span>}
      {warning && <span className="mt-0.5 block max-w-64 text-xs text-amber-700">{warning}</span>}
    </>
  )
}
