import type { ServerSummary } from '../api/servers'

const ENV_STYLES = {
  Production: 'border-red-800 bg-red-600 text-white',
  Test: 'border-amber-500 bg-amber-100 text-amber-950',
  Development: 'border-sky-300 bg-sky-50 text-sky-950',
} as const

/**
 * Sticky bar that stays on screen while the page scrolls: environment (Production is solid red),
 * server, where the change lands, and one sentence about what will run. It exists so the DBA can
 * never lose track of the target — the same words are repeated on the Execute button.
 * Wording comes from `target.ts`.
 */
export function TargetBar({
  server,
  where,
  summary,
}: {
  server: ServerSummary | undefined
  /** Where the change lands (database / server level / all databases); null before anything is chosen. */
  where: string | null
  summary: string | null
}) {
  if (!server) return null

  return (
    <div className={`sticky top-0 z-10 rounded border-2 px-4 py-2 text-sm shadow-sm ${ENV_STYLES[server.environment]}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xs font-bold uppercase tracking-wider">
          {server.environment === 'Production' ? '⚠ Production' : server.environment}
        </span>
        <span className="font-semibold">{server.name}</span>
        {where && <span className="opacity-90">› {where}</span>}
      </div>
      {summary && <p className="mt-0.5 font-medium">{summary}</p>}
    </div>
  )
}
