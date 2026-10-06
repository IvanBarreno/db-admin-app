/**
 * Full-width red banner shown whenever a Production server is selected. The plan calls for
 * it to be impossible to forget which server you're pointed at — this stays visible above
 * the SQL box for as long as that server is selected, not just in the EnvBadge pill.
 */
export function ProductionBanner({ serverName }: { serverName: string }) {
  return (
    <div className="rounded border-2 border-red-400 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800">
      ⚠ PRODUCTION — {serverName}
    </div>
  )
}
