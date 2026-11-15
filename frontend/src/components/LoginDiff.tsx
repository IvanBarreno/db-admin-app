import { useState } from 'react'
import { useLookup } from '../api/lookups'
import { useServers } from '../api/servers'
import { compareAccess, toAccess } from './accessDiff'
import { Combobox } from './Combobox'
import { downloadCsv, fileSlug, toCsv } from './csv'
import { lookupHint } from './lookupText'

/**
 * Permission diff (read-only): server roles and explicit server permissions of two logins, side by side.
 * The right side can be on ANOTHER server, which answers both classic questions:
 *   - "is this login set up the same on PROD and on DR?"  (same login, two servers)
 *   - "why can Ana do this and Luis cannot?"               (two logins, one server)
 * It uses the same `server_access` lookup as "Clone server access", so both always agree.
 */
export function LoginDiff({ serverName }: { serverName: string }) {
  const servers = useServers()
  const [leftLogin, setLeftLogin] = useState('')
  // Blank = "the same server as the left side"; it follows the page's server picker until the DBA chooses another.
  const [otherServer, setOtherServer] = useState('')
  const [rightLogin, setRightLogin] = useState('')
  const [onlyDifferences, setOnlyDifferences] = useState(false)

  const rightServer = otherServer || serverName

  const leftLogins = useLookup(serverName, 'logins')
  const rightLogins = useLookup(rightServer, 'logins')
  const left = useLookup(leftLogin ? serverName : null, 'server_access', { args: { login_name: leftLogin } })
  const right = useLookup(rightLogin ? rightServer : null, 'server_access', { args: { login_name: rightLogin } })

  const ready = leftLogin !== '' && rightLogin !== ''
  const failed = left.isError ? left.error.message : right.isError ? right.error.message : (left.data?.warning ?? right.data?.warning)

  const rows = ready && left.data && right.data ? compareAccess(toAccess(left.data.items), toAccess(right.data.items)) : []
  const different = rows.filter((r) => r.differs).length
  const shown = onlyDifferences ? rows.filter((r) => r.differs) : rows

  const leftTitle = `[${leftLogin}] on ${serverName}`
  const rightTitle = `[${rightLogin}] on ${rightServer}`

  function exportCsv() {
    downloadCsv(
      fileSlug(`diff ${leftLogin} ${serverName} vs ${rightLogin} ${rightServer}`),
      toCsv(['type', 'item', leftTitle, rightTitle, 'differs'], shown.map((r) => [r.kind, r.item, r.left ?? '', r.right ?? '', r.differs ? 'yes' : 'no'])),
    )
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-end gap-3">
        <label>
          <span className="mb-1 block text-slate-600">Login on {serverName}</span>
          <Combobox
            value={leftLogin}
            onChange={setLeftLogin}
            items={(leftLogins.data?.items ?? []).map((i) => ({ value: i.value, hint: lookupHint(i) }))}
            placeholder={leftLogins.isPending ? 'loading…' : 'pick a login'}
            className="w-64"
          />
        </label>

        <span className="pb-2 text-slate-400">compared with</span>

        <label>
          <span className="mb-1 block text-slate-600">Server</span>
          <select
            value={rightServer}
            onChange={(e) => {
              setOtherServer(e.target.value === serverName ? '' : e.target.value)
              setRightLogin('') // logins belong to a server: start again
            }}
            className="rounded border border-slate-300 px-2 py-1.5"
          >
            {servers.data?.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
                {s.name === serverName ? ' (same server)' : ''}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="mb-1 block text-slate-600">Login on {rightServer}</span>
          <Combobox
            value={rightLogin}
            onChange={setRightLogin}
            items={(rightLogins.data?.items ?? []).map((i) => ({ value: i.value, hint: lookupHint(i) }))}
            placeholder={rightLogins.isPending ? 'loading…' : 'pick a login'}
            className="w-64"
          />
        </label>

        {/* The usual "same login, other server" case in one click. */}
        {otherServer !== '' && leftLogin !== '' && rightLogin !== leftLogin && (
          <button type="button" onClick={() => setRightLogin(leftLogin)} className="pb-2 text-xs text-slate-600 underline">
            use [{leftLogin}]
          </button>
        )}
      </div>

      {!ready && <p className="text-slate-500">Pick both logins to compare their server roles and explicit server permissions.</p>}
      {ready && (left.isPending || right.isPending) && <p className="text-slate-500">Reading both logins…</p>}
      {ready && failed && <p className="text-amber-700">Could not read their access: {failed}</p>}

      {ready && !failed && left.data && right.data && (
        <div className="rounded border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-3 py-2">
            <span className={`font-medium ${different === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
              {rows.length === 0
                ? 'Neither holds any server roles or explicit server permissions.'
                : different === 0
                  ? `Identical: ${rows.length} item${rows.length === 1 ? '' : 's'}, no differences.`
                  : `${different} difference${different === 1 ? '' : 's'} in ${rows.length} item${rows.length === 1 ? '' : 's'}.`}
            </span>
            <label className="flex items-center gap-1 text-xs text-slate-600">
              <input type="checkbox" checked={onlyDifferences} onChange={(e) => setOnlyDifferences(e.target.checked)} />
              only differences
            </label>
            <button
              type="button"
              onClick={exportCsv}
              disabled={shown.length === 0}
              className="ml-auto rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>
          {shown.length > 0 && (
            <div className="max-h-[28rem] overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-1.5">Type</th>
                    <th className="px-3 py-1.5">Item</th>
                    <th className="px-3 py-1.5">{leftTitle}</th>
                    <th className="px-3 py-1.5">{rightTitle}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.key} className={`border-t border-slate-100 ${r.differs ? 'bg-amber-50' : ''}`}>
                      <td className="px-3 py-1 text-slate-500">{r.kind === 'ROLE' ? 'Role' : 'Permission'}</td>
                      <td className="px-3 py-1 font-mono">{r.item}</td>
                      <td className={`px-3 py-1 ${r.left ? '' : 'text-slate-400'}`}>{r.left ?? '— not held'}</td>
                      <td className={`px-3 py-1 ${r.right ? '' : 'text-slate-400'}`}>{r.right ?? '— not held'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-slate-500">
        Server level only (CONNECT SQL is left out). To copy what is missing, use <em>Clone server access</em> on the Operations page.
      </p>
    </div>
  )
}
