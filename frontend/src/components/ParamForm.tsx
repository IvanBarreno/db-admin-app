import type { OperationParameter } from '../api/operations'
import { useDatabaseUsers, useLogins } from '../api/servers'

/**
 * Renders one input per operation parameter, picking the control by its declared type.
 * `values` is keyed by parameter name; `onChange` receives the full updated map so the
 * parent can hold a single piece of state regardless of how many parameters there are.
 */
export function ParamForm({
  params,
  values,
  onChange,
  serverName,
  database,
}: {
  params: readonly OperationParameter[]
  values: Record<string, string>
  onChange: (values: Record<string, string>) => void
  /** Needed by the Login/User pickers to know where to fetch names from. */
  serverName: string | null
  /** Selected database ('' = none); the User picker needs one. */
  database: string
}) {
  function set(name: string, value: string) {
    onChange({ ...values, [name]: value })
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      {params.map((param) => (
        <label key={param.name} className="text-sm">
          <span className="mb-1 block text-slate-600">
            {param.name}
            {param.required && <span className="text-red-600"> *</span>}
          </span>
          <ParamInput
            param={param}
            value={values[param.name] ?? ''}
            onChange={(v) => set(param.name, v)}
            serverName={serverName}
            database={database}
          />
        </label>
      ))}
    </div>
  )
}

function ParamInput({
  param,
  value,
  onChange,
  serverName,
  database,
}: {
  param: OperationParameter
  value: string
  onChange: (value: string) => void
  serverName: string | null
  database: string
}) {
  const className = 'rounded border border-slate-300 px-2 py-1.5 text-sm'

  switch (param.type) {
    case 'Bool':
      return (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
          <option value="">—</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      )

    case 'Choice':
      return (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
          <option value="">Select…</option>
          {param.choices?.map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
      )

    case 'Password':
      return <input type="password" value={value} onChange={(e) => onChange(e.target.value)} className={className} />

    case 'Int':
      return <input type="number" value={value} onChange={(e) => onChange(e.target.value)} className={className} />

    case 'Login':
      return <NamePicker param={param} value={value} onChange={onChange} className={className} serverName={serverName} database={database} kind="login" />

    case 'User':
      return <NamePicker param={param} value={value} onChange={onChange} className={className} serverName={serverName} database={database} kind="user" />

    // Sysname, String, Database — plain text.
    default:
      return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={className} />
  }
}

/**
 * Text input with a `<datalist>` of names fetched from the server. A datalist (not a <select>)
 * keeps free typing possible: the list can be empty (Azure SQL without master access, no
 * permission on the catalog view) or the DBA may want a name that doesn't exist yet.
 *
 * Both hooks are called unconditionally (React's rules of hooks); `enabled` stops the unused one
 * from firing a request.
 */
function NamePicker({
  param,
  value,
  onChange,
  className,
  serverName,
  database,
  kind,
}: {
  param: OperationParameter
  value: string
  onChange: (value: string) => void
  className: string
  serverName: string | null
  database: string
  kind: 'login' | 'user'
}) {
  const logins = useLogins(serverName, kind === 'login')
  const users = useDatabaseUsers(serverName, database || null, kind === 'user')
  const query = kind === 'login' ? logins : users
  const names = query.data?.map((item) => item.name) ?? []
  const listId = `names-${param.name}`

  const needsDatabase = kind === 'user' && !database
  const placeholder = needsDatabase
    ? 'select a database first'
    : query.isPending && query.fetchStatus !== 'idle'
      ? 'loading…'
      : query.isError
        ? 'could not load list — type a name'
        : undefined

  return (
    <>
      <input
        type="text"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
      />
      <datalist id={listId}>
        {names.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </>
  )
}
