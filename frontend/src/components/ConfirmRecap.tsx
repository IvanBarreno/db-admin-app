/**
 * Recap table inside the red confirm panel: the few facts that must be right before pressing the
 * button — server, where, who, what, how much. Rows with an empty value are skipped.
 */
export function ConfirmRecap({ rows }: { rows: readonly (readonly [label: string, value: string | null | undefined])[] }) {
  const shown = rows.filter(([, value]) => value)

  return (
    <table className="w-full text-sm text-red-950">
      <tbody>
        {shown.map(([label, value]) => (
          <tr key={label} className="border-t border-red-200 first:border-t-0 align-top">
            <th className="w-32 py-1 pr-3 text-left font-medium text-red-800">{label}</th>
            <td className="py-1">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
