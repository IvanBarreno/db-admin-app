// passwordMap.ts — the value of a "one password per item" parameter (YAML `generate_for_each`).
//
// The form sends it as a JSON OBJECT in the normal string slot: {"app_reports": "S3cret…", "app_billing": "…"}.
// Only items with a TYPED password are in it; an item that is missing gets a generated password from the API
// when the run starts. An empty object is sent as '' (= "generate all of them").

/** The typed passwords by item name; anything that is not a JSON object of strings is "none typed". */
export function parsePasswordMap(value: string | undefined): Record<string, string> {
  if (!value) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const map: Record<string, string> = {}
    for (const [name, password] of Object.entries(parsed)) if (typeof password === 'string' && password !== '') map[name] = password
    return map
  } catch {
    return {}
  }
}

/**
 * The map as the text the API expects, keeping only the items that are still in the list (in list order, so the
 * same choices always produce the same text — the confirm token is bound to it) and that have a password.
 */
export function encodePasswordMap(passwords: Record<string, string>, names: readonly string[]): string {
  const kept: Record<string, string> = {}
  for (const name of names) if (passwords[name]) kept[name] = passwords[name]
  return Object.keys(kept).length > 0 ? JSON.stringify(kept) : ''
}
