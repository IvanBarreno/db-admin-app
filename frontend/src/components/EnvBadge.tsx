import type { ServerSummary } from '../api/servers'

/**
 * Small pill showing a server's environment. Production is red on purpose — the plan calls
 * for it to be impossible to forget which server you're pointed at.
 */
export function EnvBadge({ environment }: { environment: ServerSummary['environment'] }) {
  const styles = {
    Production: 'bg-red-100 text-red-800 ring-red-300',
    Test: 'bg-amber-100 text-amber-800 ring-amber-300',
    Development: 'bg-sky-100 text-sky-800 ring-sky-300',
  }[environment]

  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ring-1 ${styles}`}>
      {environment}
    </span>
  )
}
