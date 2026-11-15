import { useState } from 'react'
import { useNavigate } from 'react-router'
import { LoginDiff } from '../components/LoginDiff'
import { Combobox } from '../components/Combobox'
import { lookupHint } from '../components/lookupText'
import { LookupTable } from '../components/LookupTable'
import { TargetBar } from '../components/TargetBar'
import { operationLink, operationsFor } from '../components/useInOperation'
import { useLookup, type LookupItem } from '../api/lookups'
import { useOperations } from '../api/operations'
import { useDatabases, useServers } from '../api/servers'

/** One tab = one lookup shown as a table. `db` tabs need a database; the lookups live in `lookups/*.yaml`. */
interface Tab {
  id: string
  label: string
  lookup: string
  db?: boolean
}

const SERVER_TABS: Tab[] = [
  { id: 'databases', label: 'Databases', lookup: 'databases_detail' },
  { id: 'logins', label: 'Logins', lookup: 'logins' },
  { id: 'sysadmins', label: 'Sysadmins', lookup: 'sysadmins' },
  { id: 'server_roles', label: 'Server roles', lookup: 'server_roles' },
  { id: 'jobs', label: 'Agent jobs', lookup: 'jobs' },
  { id: 'sessions', label: 'Sessions', lookup: 'sessions' },
  { id: 'linked', label: 'Linked servers', lookup: 'linked_servers' },
]

const DATABASE_TABS: Tab[] = [
  { id: 'users', label: 'Users', lookup: 'users', db: true },
  { id: 'orphans', label: 'Orphaned users', lookup: 'orphaned_users', db: true },
  { id: 'db_roles', label: 'Database roles', lookup: 'database_roles', db: true },
  { id: 'schemas', label: 'Schemas', lookup: 'schemas', db: true },
  { id: 'tables', label: 'Tables', lookup: 'tables', db: true },
  { id: 'views', label: 'Views', lookup: 'views', db: true },
  { id: 'procedures', label: 'Procedures', lookup: 'procedures', db: true },
  { id: 'functions', label: 'Functions', lookup: 'functions', db: true },
]

const LOGIN_360 = 'login360'
const COMPARE = 'compare'

/**
 * Read-only discovery: what is on a server, without writing a query. Each tab is a lookup rendered as a
 * searchable, sortable table (with CSV export). "Login 360°" gathers everything one login touches.
 * Nothing here changes the server.
 */
export default function ExplorerPage() {
  const servers = useServers()
  const [serverName, setServerName] = useState<string | null>(null)
  const [database, setDatabase] = useState('')
  const [tabId, setTabId] = useState('databases')
  const [login, setLogin] = useState('')

  const databases = useDatabases(serverName)
  const server = servers.data?.find((s) => s.name === serverName)

  const tab = [...SERVER_TABS, ...DATABASE_TABS].find((t) => t.id === tabId)
  const where = tab?.db ? database || null : tabId === LOGIN_360 ? 'login 360°' : tabId === COMPARE ? 'compare logins' : 'server level'

  // "Use in operation": the operations that accept an item of the open table (worked out from the catalog,
  // see useInOperation.ts). Choosing one opens the Operations page with this row already filled in.
  const navigate = useNavigate()
  const operations = useOperations(serverName)
  const targets = tab ? operationsFor(operations.data ?? [], tab.lookup) : []
  const rowAction =
    serverName && targets.length > 0
      ? (item: LookupItem) => (
          <select
            value=""
            aria-label={`Use ${item.value} in an operation`}
            onChange={(e) => {
              const target = targets.find((t) => t.operation.id === e.target.value)
              if (target) navigate(operationLink(serverName, tab?.db ? database : '', target.operation.id, target.param.name, item.value))
            }}
            className="rounded border border-slate-300 px-1 py-0.5 text-xs text-slate-600"
          >
            <option value="">Use in…</option>
            {targets.map((t) => (
              <option key={t.operation.id} value={t.operation.id} title={t.operation.description ?? undefined}>
                [{t.operation.category}] {t.operation.name}
                {t.operation.destructive ? ' ⚠' : ''}
              </option>
            ))}
          </select>
        )
      : undefined

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Explorer</h2>

      <TargetBar server={server} where={where} summary="Browsing (read-only)" />

      {servers.isError && <p className="text-red-700">Could not load servers: {servers.error.message}</p>}

      {servers.data && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">Server</span>
            <select
              value={serverName ?? ''}
              onChange={(e) => {
                setServerName(e.target.value || null)
                setDatabase('')
              }}
              className="rounded border border-slate-300 px-2 py-1.5"
            >
              <option value="">Select a server…</option>
              {servers.data.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          {tab?.db && (
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Database</span>
              <select
                value={database}
                onChange={(e) => setDatabase(e.target.value)}
                disabled={databases.isPending}
                className="rounded border border-slate-300 px-2 py-1.5"
              >
                <option value="">Select a database…</option>
                {databases.data?.map((d) => (
                  <option key={d.name} value={d.name} disabled={!d.isOnline}>
                    {d.name}
                    {d.isOnline ? '' : ` (${d.state.toLowerCase()})`}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {serverName && (
        <>
          <nav className="space-y-1 text-sm">
            <TabRow label="Server" tabs={SERVER_TABS} current={tabId} onPick={setTabId} />
            <TabRow label="Database" tabs={DATABASE_TABS} current={tabId} onPick={setTabId} />
            <div className="flex items-center gap-1">
              <span className="w-20 text-xs uppercase tracking-wide text-slate-400">Principal</span>
              <TabButton active={tabId === LOGIN_360} onClick={() => setTabId(LOGIN_360)}>
                Login 360°
              </TabButton>
              <TabButton active={tabId === COMPARE} onClick={() => setTabId(COMPARE)}>
                Compare logins
              </TabButton>
            </div>
          </nav>

          {tabId === LOGIN_360 && <Login360 serverName={serverName} login={login} onLogin={setLogin} />}
          {/* key: a different server on the left means different logins, so start the comparison again. */}
          {tabId === COMPARE && <LoginDiff key={serverName} serverName={serverName} />}

          {tab && !tab.db && (
            <LookupTable key={tab.id} serverName={serverName} lookupId={tab.lookup} title={tab.label} rowAction={rowAction} />
          )}

          {tab?.db && !database && <p className="text-slate-500">Select a database to list its {tab.label.toLowerCase()}.</p>}
          {tab?.db && database && (
            <LookupTable
              key={`${tab.id}-${database}`}
              serverName={serverName}
              lookupId={tab.lookup}
              database={database}
              title={`${tab.label} in ${database}`}
              rowAction={rowAction}
            />
          )}
        </>
      )}
    </div>
  )
}

function TabRow({ label, tabs, current, onPick }: { label: string; tabs: Tab[]; current: string; onPick: (id: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="w-20 text-xs uppercase tracking-wide text-slate-400">{label}</span>
      {tabs.map((t) => (
        <TabButton key={t.id} active={current === t.id} onClick={() => onPick(t.id)}>
          {t.label}
        </TabButton>
      ))}
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2 py-1 ${active ? 'bg-slate-800 font-medium text-white' : 'text-slate-600 hover:bg-slate-100'}`}
    >
      {children}
    </button>
  )
}

/** Everything one login touches on the server, from the same lookups the operations use. */
function Login360({ serverName, login, onLogin }: { serverName: string; login: string; onLogin: (login: string) => void }) {
  const logins = useLookup(serverName, 'logins')
  const args = { login_name: login }

  return (
    <div className="space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block text-slate-600">Login</span>
        {/* The app's own combobox (full list on focus, ▾ button), not a native datalist. Read-only page: protected logins may be viewed. */}
        <Combobox
          value={login}
          onChange={onLogin}
          items={(logins.data?.items ?? []).map((i) => ({ value: i.value, hint: lookupHint(i) }))}
          placeholder={logins.isPending ? 'loading…' : 'pick or type a login'}
          className="w-72"
        />
      </label>

      {login === '' ? (
        <p className="text-slate-500">Choose a login to see its status, roles, sessions, jobs and databases.</p>
      ) : (
        <div className="space-y-4">
          <LookupTable key={`s-${login}`} serverName={serverName} lookupId="login_status" args={args} title="Status" emptyText="No such login." />
          <LookupTable key={`i-${login}`} serverName={serverName} lookupId="login_impact" args={args} title="What it holds (counts)" />
          <LookupTable
            key={`r-${login}`}
            serverName={serverName}
            lookupId="server_roles"
            args={args}
            filter={(item) => (item.extra as Record<string, unknown>).is_member === true}
            title="Server roles it is a member of"
            emptyText="Not a member of any server role."
          />
          <LookupTable key={`se-${login}`} serverName={serverName} lookupId="sessions" args={args} title="Open sessions" emptyText="No open sessions." />
          <LookupTable key={`j-${login}`} serverName={serverName} lookupId="jobs" args={args} title="SQL Agent jobs it owns" emptyText="Owns no jobs." />
          <LookupTable key={`d-${login}`} serverName={serverName} lookupId="databases_owned" args={args} title="Databases it owns" emptyText="Owns no databases." />
          <p className="text-xs text-slate-500">
            Its users in every database: run the <em>User mapping</em> or <em>Database role memberships (all databases)</em> audit on the Operations page.
          </p>
        </div>
      )}
    </div>
  )
}
