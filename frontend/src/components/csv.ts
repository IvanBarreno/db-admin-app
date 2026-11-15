// csv.ts — turning a grid into a CSV file the browser downloads. Shared by the Explorer tables (LookupTable)
// and by every result grid (ResultsGrid), so both export exactly the same way.

/** Quotes a value for CSV (RFC 4180): wrap in quotes when it holds a comma, quote or line break. */
export function csvCell(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** A raw cell as CSV text: NULL becomes an empty field, everything else its plain text. */
export function csvValue(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

/** The whole file: a header line, then one line per row, separated by CRLF as the RFC asks. */
export function toCsv(columns: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [columns, ...rows].map((row) => row.map((cell) => csvCell(csvValue(cell))).join(',')).join('\r\n')
}

/** A safe file name from free text ("Login exists + status" → "login-exists-status"). */
export function fileSlug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'result'
  )
}

/** Byte-order mark (code point FEFF). Excel needs it at the start of a UTF-8 file to show accents correctly. */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff)

/**
 * Makes the browser save `csv` as a file. There is no server round trip: the text becomes a Blob (an
 * in-memory file), a temporary object URL points at it, and clicking a link with `download` saves it.
 */
export function downloadCsv(fileName: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([BYTE_ORDER_MARK, csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
