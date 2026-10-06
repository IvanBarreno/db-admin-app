import type { OperationParameter } from '../api/operations'

/**
 * Renders one input per operation parameter, picking the control by its declared type.
 * `values` is keyed by parameter name; `onChange` receives the full updated map so the
 * parent can hold a single piece of state regardless of how many parameters there are.
 */
export function ParamForm({
  params,
  values,
  onChange,
}: {
  params: readonly OperationParameter[]
  values: Record<string, string>
  onChange: (values: Record<string, string>) => void
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
          <ParamInput param={param} value={values[param.name] ?? ''} onChange={(v) => set(param.name, v)} />
        </label>
      ))}
    </div>
  )
}

function ParamInput({
  param,
  value,
  onChange,
}: {
  param: OperationParameter
  value: string
  onChange: (value: string) => void
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

    // Sysname, String, Database, Login — all plain text for now. Database/Login pickers
    // populated from live data are a later refinement, not needed to exercise the catalog.
    default:
      return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={className} />
  }
}
