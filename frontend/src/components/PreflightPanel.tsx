import type { Schema } from '../api/client'

export type CheckResult = Schema<'CheckResult'>

/** A check result optionally tagged with the workflow step it belongs to. */
export type PanelCheck = CheckResult & { stepTitle?: string }

/**
 * Outcome of the preflight checks (YAML `checks:`) from a preview. Blocking failures are red and stop
 * the run (the server also refuses it); warnings are amber and informational; passed checks are
 * collapsed into one line so the panel stays quiet when everything is fine.
 */
export function PreflightPanel({ checks }: { checks: readonly PanelCheck[] | null | undefined }) {
  if (!checks || checks.length === 0) return null

  const failed = checks.filter((c) => !c.ok)
  const passed = checks.length - failed.length

  return (
    <div className="space-y-1 text-sm">
      {failed.map((c, i) => (
        <p
          key={`${c.stepTitle ?? ''}${c.id}${i}`}
          className={`rounded border px-3 py-2 ${
            c.blocking ? 'border-red-300 bg-red-50 text-red-900' : 'border-amber-300 bg-amber-50 text-amber-900'
          }`}
        >
          <strong>{c.blocking ? '✖ Blocked' : '⚠ Warning'}</strong>
          {c.stepTitle && <span className="text-xs opacity-70"> · {c.stepTitle}</span>}
          {' — '}
          {c.message}
        </p>
      ))}
      {passed > 0 && (
        <p className="text-xs text-emerald-700">
          ✓ {passed} preflight {passed === 1 ? 'check' : 'checks'} passed
        </p>
      )}
    </div>
  )
}
