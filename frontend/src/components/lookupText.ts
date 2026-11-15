// lookupText.ts — wording and list helpers shared by the lookup-driven controls (combobox, checklists).
// Kept apart from the components so those files only export components (React fast refresh).

import type { LookupItem } from '../api/lookups'

/** What the form sends for a "tick items" list when the DBA unticks everything (see MultiValues.NoneSentinel in the API). */
export const NONE = '(none)'

/** Items of a list value (a JSON array of strings); anything else is an empty list. */
export function parseList(value: string | undefined): string[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

/** A list as the JSON text the API expects; an empty list is the empty string (= "not set"). */
export function encodeList(values: readonly string[]): string {
  return values.length > 0 ? JSON.stringify(values) : ''
}

/**
 * Why a lookup item cannot be picked, from the parameter's `lock_when` rules (null = pickable). A rule with `ifParam`
 * only applies while that other field has the wanted value. Text comparison: booleans are "true" / "false".
 */
export function lockReason(
  rules: readonly { column: string; values: string[]; not: boolean; reason: string; ifParam?: string | null; ifValue?: string | null }[] | null | undefined,
  item: LookupItem,
  values: Record<string, string>,
): string | null {
  for (const rule of rules ?? []) {
    if (rule.ifParam && (values[rule.ifParam] ?? '') !== rule.ifValue) continue
    const cell = (item.extra as Record<string, unknown>)[rule.column]
    if (cell === undefined || cell === null) continue // the lookup has no such fact here (e.g. Azure): do not lock
    const listed = rule.values.includes(String(cell))
    if (rule.not ? !listed : listed) return rule.reason
  }
  return null
}

/** The first parameter that a `lock_when` rule is waiting for (still blank), or null. */
export function lockWaitsFor(
  rules: readonly { ifParam?: string | null }[] | null | undefined,
  values: Record<string, string>,
): string | null {
  for (const rule of rules ?? []) if (rule.ifParam && (values[rule.ifParam] ?? '') === '') return rule.ifParam
  return null
}

/** A table cell from a lookup value: booleans as ✓ / –, dates trimmed to minutes, null as empty. */
export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? '✓' : '–'
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return value.slice(0, 16).replace('T', ' ')
  return String(value)
}

/** Quotes a value for CSV (RFC 4180): wrap in quotes when it holds a comma, quote or line break. */
export function csvCell(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * Text shown next to an item: the server's own facts (disabled, orphaned, state, owner, host...),
 * so the DBA picks with the same information they would look up in SSMS.
 */
export function lookupHint(item: LookupItem): string {
  const extra = item.extra as Record<string, unknown>
  const flags: string[] = []
  if (extra.is_high_risk === true) flags.push('⚠ high risk')
  if (extra.is_disabled === true) flags.push('disabled')
  if (extra.is_enabled === false || extra.is_enabled === 0) flags.push('disabled')
  if (extra.is_orphan === true) flags.push('orphaned')
  if (typeof extra.state === 'string' && extra.state !== 'ONLINE') flags.push(extra.state.toLowerCase())
  if (typeof extra.type === 'string') flags.push(extra.type.toLowerCase().replace('_', ' '))
  if (typeof extra.owner === 'string') flags.push(`owner ${extra.owner}`)
  if (typeof extra.host_name === 'string') {
    flags.push([extra.host_name, extra.program_name, extra.database_name].filter((v) => typeof v === 'string' && v).join(' · '))
  }
  const label = item.label !== item.value ? `${item.label} · ` : ''
  return label + flags.join(', ')
}
