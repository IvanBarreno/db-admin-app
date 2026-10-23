import { useCallback, useEffect, useRef, useState } from 'react'
import type { OperationParameter } from '../api/operations'
import { useLookup } from '../api/lookups'
import { Combobox, type ComboItem } from './Combobox'
import { lookupHint } from './lookupText'
import { useLookupState, type BlockReporter } from './lookupState'
import { MultiChecklist } from './MultiChecklist'
import { PasswordGeneratorModal } from './PasswordGeneratorModal'
import { RoleChecklist } from './RoleChecklist'

/**
 * Renders one input per operation parameter, picking the control by its declared type.
 * `values` is keyed by parameter name; `onChange` receives the full updated map so the
 * parent can hold a single piece of state regardless of how many parameters there are.
 *
 * Every field shows a readable label with an ⓘ tooltip (the parameter's `help`). A field fed by a list that cannot
 * be loaded is disabled and says why; `onBlockedChange` receives the reasons of the REQUIRED ones so the page can
 * keep Preview / Execute off and explain it. Parameters marked `advanced` live in a collapsed section.
 */
export function ParamForm({
  params,
  values,
  onChange,
  serverName,
  database,
  allowProtected = false,
  onBlockedChange,
}: {
  params: readonly OperationParameter[]
  values: Record<string, string>
  onChange: (values: Record<string, string>) => void
  /** Needed by the lookup pickers to know where to fetch names from. */
  serverName: string | null
  /** Selected database ('' = none); database-scoped lookups (users, roles...) need one. */
  database: string
  /** True for read-only operations (audits): they may look at protected logins, which are locked everywhere else. */
  allowProtected?: boolean
  /** Reasons why required fields cannot be filled in right now (empty list = nothing blocks). */
  onBlockedChange?: (reasons: string[]) => void
}) {
  const [blocked, setBlocked] = useState<Record<string, string>>({})

  const report = useCallback<BlockReporter>((name, reason) => {
    setBlocked((previous) => {
      if ((previous[name] ?? null) === reason) return previous
      const next = { ...previous }
      if (reason === null) delete next[name]
      else next[name] = reason
      return next
    })
  }, [])

  useEffect(() => {
    onBlockedChange?.(Object.values(blocked))
  }, [blocked, onBlockedChange])

  function set(name: string, value: string) {
    onChange({ ...values, [name]: value })
  }

  const doneGroups = new Set<string>()

  function renderField(param: OperationParameter) {
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
            allowProtected={allowProtected}
            onBlock={report}
          />
        </div>
      )
    }

    return (
      <label key={param.name} className="text-sm">
        <FieldLabel param={param} />
        <ParamInput
          param={param}
          value={values[param.name] ?? ''}
          onChange={(v) => set(param.name, v)}
          serverName={serverName}
          database={database}
          values={values}
          allowProtected={allowProtected}
          onBlock={report}
        />
      </label>
    )
  }

  const advanced = params.filter((p) => p.advanced)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">{params.filter((p) => !p.advanced).map(renderField)}</div>
      {advanced.length > 0 && (
        <details className="rounded border border-slate-200 px-3 py-2 text-sm">
          <summary className="cursor-pointer text-slate-600">Advanced options ({advanced.length})</summary>
          <div className="mt-3 flex flex-wrap items-end gap-3">{advanced.map(renderField)}</div>
        </details>
      )}
    </div>
  )
}

/** The field's name: its label (or a readable form of the parameter name) and an ⓘ whose tooltip is the help text. */
function FieldLabel({ param }: { param: OperationParameter }) {
  return (
    <span className="mb-1 flex items-center gap-1 text-slate-600">
      {param.label ?? param.name.replaceAll('_', ' ')}
      {param.required && <span className="text-red-600"> *</span>}
      {param.help && (
        <span title={param.help} aria-label={param.help} className="cursor-help text-xs text-slate-400">
          ⓘ
        </span>
      )}
    </span>
  )
}

/** A choice list with a tooltip on every option and, under it, what the selected option does. */
function ChoiceSelect({
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
  const help = param.choiceHelp ?? {}
  return (
    <>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={className} title={help[value]}>
        <option value="">Select…</option>
        {param.choices?.map((choice) => (
          <option key={choice} value={choice} title={help[choice]}>
            {choice}
          </option>
        ))}
      </select>
      {value && help[value] && <span className="mt-0.5 block max-w-72 text-xs text-slate-500">{help[value]}</span>}
    </>
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
      <ChoiceSelect param={param} value={value} onChange={onChange} className={className} />
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
  allowProtected,
  onBlock,
}: {
  param: OperationParameter
  value: string
  onChange: (value: string) => void
  serverName: string | null
  database: string
  values: Record<string, string>
  allowProtected: boolean
  onBlock: BlockReporter
}) {
  const className = 'rounded border border-slate-300 px-2 py-1.5 text-sm'

  switch (param.type) {
    case 'Bool':
      // A blank value means "use the default": say which one, instead of an unexplained dash.
      return (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
          <option value="">{param.default ? `Default (${param.default})` : '—'}</option>
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
      return <ChoiceSelect param={param} value={value} onChange={onChange} className={className} />

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
            serverName={serverName}
            database={database}
            values={values}
            allowProtected={allowProtected}
            onBlock={onBlock}
          />
        )
      }
      // Sysname, String — plain text (with domain-style prefixes to click when the YAML asks for them).
      return (
        <>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore="true"
            className={className}
          />
          {param.prefixLookup && <PrefixChips lookupId={param.prefixLookup} serverName={serverName} value={value} onChange={onChange} />}
        </>
      )
  }
}

/**
 * Click-to-insert prefixes for names written PREFIX\name (Windows logins): the server's own domain first, then the
 * domains already used by existing logins. Clicking replaces the prefix part and keeps what was typed after it.
 */
function PrefixChips({
  lookupId,
  serverName,
  value,
  onChange,
}: {
  lookupId: string
  serverName: string | null
  value: string
  onChange: (value: string) => void
}) {
  const state = useLookupState(serverName, lookupId)
  if (state.status === 'loading') return null
  if (state.status !== 'ready') return <span className="mt-0.5 block text-xs text-slate-500">{state.reason}</span>

  const name = value.includes('\\') ? value.slice(value.indexOf('\\') + 1) : value
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
      <span className="text-slate-500">Domain:</span>
      {state.items.map((item) => (
        <button
          key={item.value}
          type="button"
          title={String((item.extra as Record<string, unknown>).source ?? '')}
          onClick={() => onChange(`${item.value}\\${name}`)}
          className="rounded border border-slate-300 px-1.5 py-0.5 font-mono hover:bg-slate-50"
        >
          {item.value}\
        </button>
      ))}
    </div>
  )
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
 * Input fed by a server-side lookup, through the app's own combobox (name first, hint beside it, full list on focus).
 * Free typing stays possible when the field accepts new names. When the field must pick something that exists
 * (`must_exist`) and the list cannot be loaded or is empty, the field is DISABLED and says why; if it is also
 * required, the form is blocked with that reason. A protected login (the account the app connects with) is
 * shown locked in the list and flagged if typed, except for read-only operations.
 */
function LookupInput({
  param,
  value,
  onChange,
  serverName,
  database,
  values,
  allowProtected,
  onBlock,
}: {
  param: OperationParameter
  value: string
  onChange: (value: string) => void
  serverName: string | null
  database: string
  values: Record<string, string>
  allowProtected: boolean
  onBlock: BlockReporter
}) {
  // Values of the parameters this list depends on (e.g. the login whose roles are ticked).
  const args: Record<string, string> = {}
  for (const name of param.dependsOn ?? []) args[name] = values[name] ?? ''

  const state = useLookupState(serverName, param.effectiveSource ?? null, { database, args })
  const strict = param.mustExist
  const ready = state.status === 'ready'
  const cannotList = state.status === 'idle' || state.status === 'waiting' || state.status === 'empty' || state.status === 'unavailable'

  // A field that must pick something existing is useless without a list: disable it (and block the form if required).
  const disabled = strict && cannotList
  const blocking = disabled && param.required ? state.reason : null
  useEffect(() => {
    onBlock(param.name, blocking)
    return () => onBlock(param.name, null)
  }, [onBlock, param.name, blocking])

  const protectedLocks = !allowProtected && param.protect !== false
  const comboItems: ComboItem[] = state.items.map((item) => {
    const extra = item.extra as Record<string, unknown>
    return {
      value: item.value,
      hint: lookupHint(item),
      description: typeof extra.description === 'string' ? extra.description : undefined,
      locked: protectedLocks && extra.is_protected === true ? String(extra.protected_reason ?? 'protected') : undefined,
    }
  })

  const typed = value.trim().toLowerCase()
  const match = state.items.find((i) => i.value.toLowerCase() === typed)
  const lockedHit = protectedLocks && match && (match.extra as Record<string, unknown>).is_protected === true ? match : null
  const unknown = strict && ready && typed !== '' && !match

  const placeholder = state.status === 'loading' ? 'loading…' : disabled ? state.reason ?? undefined : undefined

  return (
    <>
      <Combobox
        value={value}
        onChange={onChange}
        items={comboItems}
        disabled={disabled}
        placeholder={placeholder}
        invalid={unknown || lockedHit !== null}
        className="w-64"
      />
      {disabled && (
        <span className="mt-0.5 block max-w-72 text-xs text-amber-700">
          {state.reason}
          {state.retryable && (
            <button type="button" onClick={state.retry} className="ml-2 underline">
              Retry
            </button>
          )}
        </span>
      )}
      {!disabled && cannotList && <span className="mt-0.5 block max-w-72 text-xs text-slate-500">{state.reason} You can still type a name.</span>}
      {unknown && <span className="mt-0.5 block text-xs text-red-600">not found on this server</span>}
      {lockedHit && (
        <span className="mt-0.5 block max-w-72 text-xs text-red-600">
          🔒 [{lockedHit.value}] is {String((lockedHit.extra as Record<string, unknown>).protected_reason)}: view only — pick another.
        </span>
      )}
    </>
  )
}
