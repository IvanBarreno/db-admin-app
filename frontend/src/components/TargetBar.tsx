import { Group } from '@mantine/core'
import type { ServerSummary } from '../api/servers'
import classes from './TargetBar.module.css'

/**
 * Sticky bar that stays on screen while the page scrolls: environment (Production is solid red),
 * server, where the change lands, and one sentence about what will run. It exists so the DBA can
 * never lose track of the target — the same words are repeated on the Execute button.
 * Wording comes from `target.ts`; colours per environment are in TargetBar.module.css.
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
    // data-environment lets the CSS pick the colours: .bar[data-environment='Production'] { ... }.
    // role="status": screen readers announce the target when it changes, without stealing focus.
    <div className={classes.bar} data-environment={server.environment} role="status">
      <Group gap="sm" wrap="wrap" align="center" style={{ rowGap: 2 }}>
        <span className={classes.environment}>{server.environment === 'Production' ? '⚠ Production' : server.environment}</span>
        <span className={classes.server}>{server.name}</span>
        {where && <span className={classes.where}>› {where}</span>}
      </Group>
      {summary && <p className={classes.summary}>{summary}</p>}
    </div>
  )
}
