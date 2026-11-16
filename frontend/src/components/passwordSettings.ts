// passwordSettings.ts — the app-wide default options of the password generator.
//
// Stored in this browser's localStorage (a per-viewer convenience, not shared state). The generator
// modal starts from these defaults every time it opens; the DBA can change them for one password, or
// tick "save as default" to change them for the whole app.

export interface PasswordSettings {
  length: number
  upper: boolean
  lower: boolean
  digits: boolean
  symbols: boolean
  excludeLookalikes: boolean
}

export const FACTORY_PASSWORD_SETTINGS: PasswordSettings = {
  length: 20,
  upper: true,
  lower: true,
  digits: true,
  symbols: true,
  excludeLookalikes: true,
}

const KEY = 'sqladmin.passwordSettings'

/** Saved defaults, or the factory ones when nothing is saved or storage is unavailable/corrupt. */
export function loadPasswordSettings(): PasswordSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return FACTORY_PASSWORD_SETTINGS
    const parsed = JSON.parse(raw) as Partial<PasswordSettings>
    return {
      length: clampLength(parsed.length),
      upper: parsed.upper ?? true,
      lower: parsed.lower ?? true,
      digits: parsed.digits ?? true,
      symbols: parsed.symbols ?? true,
      excludeLookalikes: parsed.excludeLookalikes ?? true,
    }
  } catch {
    return FACTORY_PASSWORD_SETTINGS
  }
}

export function savePasswordSettings(settings: PasswordSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // Private window / blocked storage: the settings simply apply to this use only.
  }
}

export function clampLength(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : FACTORY_PASSWORD_SETTINGS.length
  return Math.min(128, Math.max(12, n))
}
