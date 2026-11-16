import { Accordion, Button, Group, NumberInput, Select, Stack, Switch, Text, TextInput } from '@mantine/core'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { OperationParameter } from '../api/operations'
import { useLookup, type LookupItem } from '../api/lookups'
import { Combobox, type ComboItem } from './Combobox'
import { fieldLabel, fieldProps } from './fieldKit'
import { LookupNotice } from './LookupNotice'
import { lockReason, lookupHint } from './lookupText'
import { useLookupState, type BlockReporter } from './lookupState'
import { MultiChecklist } from './MultiChecklist'
import { PasswordField } from './PasswordField'
import { PasswordRows } from './PasswordRows'
import { RoleChecklist } from './RoleChecklist'
import { TypedList } from './TypedList'

/**
 * Renders one control per operation parameter, picking the control by the parameter's declared type.
 * `values` is keyed by parameter name; `onChange` receives the full updated map so the
 * parent can hold a single piece of state regardless of how many parameters there are.
 *
 * Which control for which parameter (the "field kit" of the UI plan):
 *   string / sysname          → TextInput (with click-to-insert domain prefixes when the YAML asks)
 *   int                       → NumberInput
 *   bool                      → Switch showing the default until the DBA touches it
 *   choice                    → Select, with what the chosen option does under it
 *   login / user / database   → the lookup picker (Combobox.tsx) with hints, locked rows and reasons
 *   list from a lookup        → MultiChecklist; an add/drop pair of lists → RoleChecklist
 *   typed list                → TypedList (textarea)
 *   password                  → PasswordField (show / copy / Generate… modal)
 *   list + one password each  → PasswordRows (one row per login)
 *
 * A field fed by a list that cannot be loaded is disabled and says why; `onBlockedChange` receives the
 * reasons of the REQUIRED ones so the page can keep Preview / Execute off and explain it.
 * Parameters marked `advanced` live in a collapsed section.
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

  /** One parameter → one cell of the form grid (or nothing, when another control already covers it). */
  function renderField(param: OperationParameter): ReactNode {
    // Two list parameters of one checklist group (add / drop) are ONE checklist of the principal's roles.
    if (param.checklistGroup) {
      if (doneGroups.has(param.checklistGroup)) return null
      doneGroups.add(param.checklistGroup)
      const addParam = params.find((p) => p.checklistGroup === param.checklistGroup && p.checklistAction === 'add')
      const dropParam = params.find((p) => p.checklistGroup === param.checklistGroup && p.checklistAction === 'drop')
      if (!addParam || !dropParam) return null
      return (
        <Wide key={`group-${param.checklistGroup}`}>
          <RoleChecklist
            addParam={addParam}
            dropParam={dropParam}
            values={values}
            onChange={(patch) => onChange({ ...values, ...patch })}
            serverName={serverName}
            database={database}
          />
        </Wide>
      )
    }

    // "One password per item": the list and its passwords are ONE control (a row per login). The password
    // parameter draws nothing by itself; the list parameter draws both.
    if (param.type === 'Password' && param.generateForEach) return null
    const perItemPassword = params.find((p) => p.type === 'Password' && p.generateForEach === param.name)
    if (param.multi && perItemPassword) {
      return (
        <Wide key={param.name}>
          <PasswordRows
            listParam={param}
            passwordParam={perItemPassword}
            values={values}
            onChange={(patch) => onChange({ ...values, ...patch })}
            serverName={serverName}
            database={database}
            allowProtected={allowProtected}
            onBlock={report}
          />
        </Wide>
      )
    }

    // A list with no lookup behind it is typed by the DBA (names of things to create).
    if (param.multi && !param.effectiveSource) {
      return (
        <Wide key={param.name}>
          <TypedList param={param} value={values[param.name] ?? ''} onChange={(v) => set(param.name, v)} onBlock={report} />
        </Wide>
      )
    }

    // Other lists: a checklist of what the server offers.
    if (param.multi) {
      return (
        <Wide key={param.name}>
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
        </Wide>
      )
    }

    // Passwords carry buttons beside the box, so they get the full row too.
    const Cell = param.type === 'Password' ? Wide : Narrow
    return (
      <Cell key={param.name}>
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
      </Cell>
    )
  }

  const advanced = params.filter((p) => p.advanced)

  return (
    <Stack gap="md">
      <FormGrid>{params.filter((p) => !p.advanced).map(renderField)}</FormGrid>
      {advanced.length > 0 && (
        // Accordion with one item = a section that is closed until the DBA opens it.
        <Accordion variant="contained" chevronPosition="left">
          <Accordion.Item value="advanced">
            <Accordion.Control>
              <Text size="sm">Advanced options ({advanced.length})</Text>
            </Accordion.Control>
            <Accordion.Panel>
              <FormGrid>{advanced.map(renderField)}</FormGrid>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      )}
    </Stack>
  )
}

// ---------------------------------------------------------------------------------------------------
// Layout: a CSS grid that fits as many 280px-wide columns as the page allows. Simple fields take one
// column; lists and passwords span the whole row (grid-column: 1 / -1 = "from the first line to the last").
// ---------------------------------------------------------------------------------------------------

function FormGrid({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 'var(--mantine-spacing-md)',
        alignItems: 'start',
      }}
    >
      {children}
    </div>
  )
}

function Narrow({ children }: { children: ReactNode }) {
  return <div>{children}</div>
}

function Wide({ children }: { children: ReactNode }) {
  return <div style={{ gridColumn: '1 / -1' }}>{children}</div>
}

// ---------------------------------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------------------------------

/** A choice list; under it, what the selected option does (from the YAML `choice_help`). */
function ChoiceSelect({
  param,
  value,
  onChange,
  disabledChoices,
  note,
}: {
  param: OperationParameter
  value: string
  onChange: (value: string) => void
  /** Choices shown but not selectable (e.g. the state the login is already in). */
  disabledChoices?: readonly string[]
  /** Extra line under the field (e.g. what the server says about the current state). */
  note?: string
}) {
  const help = param.choiceHelp ?? {}
  // The field's own help, then the meaning of the chosen option, then the note: all under the control.
  const description = [param.help, value ? help[value] : undefined, note].filter(Boolean).join(' — ')

  return (
    <Select
      {...fieldProps(param)}
      description={description || undefined}
      placeholder="Select…"
      data={(param.choices ?? []).map((choice) => ({ value: choice, label: choice, disabled: disabledChoices?.includes(choice) }))}
      // Select speaks `null` for "nothing chosen"; the form speaks ''.
      value={value === '' ? null : value}
      onChange={(next) => onChange(next ?? '')}
      // A required choice cannot be cleared by clicking it again.
      allowDeselect={!param.required}
    />
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
  const suggest = param.suggest!
  const args: Record<string, string> = {}
  for (const name of suggest.dependsOn) args[name] = values[name] ?? ''
  const ready = Object.values(args).every((v) => v !== '')

  const query = useLookup(ready ? serverName : null, suggest.lookup, { database, args })
  const raw = query.data?.items[0]?.extra[suggest.column]
  const rawText = raw === undefined || raw === null ? null : String(raw)
  const suggested = rawText === null ? null : (suggest.map[rawText] ?? null)

  // The server's answer decides: the only choice left open is the one that changes the current state
  // (a disabled login can only be ENABLED), so it is selected and the others are greyed out.
  useEffect(() => {
    if (suggested !== null && value !== suggested) onChange(suggested)
  }, [suggested, value, onChange])

  const disabledChoices = suggested === null ? undefined : (param.choices ?? []).filter((c) => c !== suggested)

  return (
    <ChoiceSelect
      param={param}
      value={value}
      onChange={onChange}
      disabledChoices={disabledChoices}
      note={suggested !== null ? `Server says ${suggest.column} = ${rawText}: only ${suggested} makes sense.` : undefined}
    />
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
  switch (param.type) {
    case 'Bool': {
      // A blank value means "use the default": the switch SHOWS that default, and the text says it is one.
      // Flipping the switch writes an explicit "true" / "false".
      const effective = (value || param.default || 'false') === 'true'
      const usingDefault = value === '' && param.default != null && param.default !== ''
      return (
        <Switch
          label={fieldLabel(param)}
          description={[param.help, usingDefault ? `Default: ${param.default}` : undefined].filter(Boolean).join(' — ') || undefined}
          checked={effective}
          onChange={(event) => onChange(event.currentTarget.checked ? 'true' : 'false')}
          // Line the switch up with the text boxes of its neighbours, which have a label row above them.
          mt="lg"
        />
      )
    }

    case 'Choice':
      if (param.suggest) {
        return <SuggestedChoice param={param} value={value} onChange={onChange} serverName={serverName} database={database} values={values} />
      }
      return <ChoiceSelect param={param} value={value} onChange={onChange} />

    case 'Password':
      return (
        <PasswordField
          {...fieldProps(param)}
          required={param.required}
          value={value}
          onChange={onChange}
          placeholder={param.generate ? 'blank = generated when the run starts' : undefined}
        />
      )

    case 'Int':
      return (
        <NumberInput
          {...fieldProps(param)}
          allowDecimal={false}
          placeholder={param.default ? `default ${param.default}` : undefined}
          // The form keeps every value as text. NumberInput reports a number, or '' when the box is emptied.
          value={value === '' ? '' : Number(value)}
          onChange={(next) => onChange(next === '' ? '' : String(next))}
        />
      )

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
          <TextInput
            {...fieldProps(param)}
            value={value}
            onChange={(event) => onChange(event.currentTarget.value)}
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore="true"
            spellCheck={false}
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
  if (state.status !== 'ready') return <LookupNotice state={state} />

  const name = value.includes('\\') ? value.slice(value.indexOf('\\') + 1) : value
  return (
    <Group gap={6} mt={6} wrap="wrap">
      <Text size="xs" c="dimmed">
        Domain:
      </Text>
      {state.items.map((item) => (
        <Button
          key={item.value}
          // "compact-xs": a button as small as a tag, for a row of quick choices.
          size="compact-xs"
          variant="default"
          title={String((item.extra as Record<string, unknown>).source ?? '')}
          onClick={() => onChange(`${item.value}\\${name}`)}
          styles={{ label: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
        >
          {item.value}\
        </Button>
      ))}
    </Group>
  )
}

/**
 * Input fed by a server-side lookup, through the app's picker (name first, hint beside it, full list on focus).
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
  // Why an item cannot be picked: it is a protected login, or a `lock_when` rule of the parameter applies (Windows login on a password reset…).
  const lockOf = (item: LookupItem): string | undefined => {
    const extra = item.extra as Record<string, unknown>
    if (protectedLocks && extra.is_protected === true) return `view only — ${String(extra.protected_reason ?? 'protected')}`
    return lockReason(param.lockWhen, item, values) ?? undefined
  }
  const comboItems: ComboItem[] = state.items.map((item) => {
    const extra = item.extra as Record<string, unknown>
    return {
      value: item.value,
      hint: lookupHint(item),
      description: typeof extra.description === 'string' ? extra.description : undefined,
      locked: lockOf(item),
    }
  })

  const typed = value.trim().toLowerCase()
  const match = state.items.find((i) => i.value.toLowerCase() === typed)
  const lockedHit = match && lockOf(match) ? match : null
  const unknown = strict && ready && typed !== '' && !match

  // One error line under the field: a value that is not on the server, or one that may not be changed.
  const error = unknown
    ? 'Not found on this server.'
    : lockedHit
      ? `🔒 [${lockedHit.value}]: ${lockOf(lockedHit)}. Pick another.`
      : undefined

  return (
    <>
      <Combobox
        {...fieldProps(param)}
        required={param.required}
        value={value}
        onChange={onChange}
        items={comboItems}
        disabled={disabled}
        placeholder={state.status === 'loading' ? 'loading…' : undefined}
        error={error}
      />
      {/* Why there is no list: as a warning when the field is unusable, as a soft note when typing still works. */}
      {disabled && <LookupNotice state={state} />}
      {!disabled && cannotList && <LookupNotice state={state} suffix="You can still type a name." />}
    </>
  )
}
