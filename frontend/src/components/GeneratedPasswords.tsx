import { useState } from 'react'

/**
 * Shows server-generated passwords once. They are not stored or logged anywhere (the audit log
 * keeps "***"), so this panel is the only copy: it disappears when the result is replaced.
 */
export function GeneratedPasswords({ passwords }: { passwords: Record<string, string> }) {
  const [copied, setCopied] = useState<string | null>(null)

  async function copy(name: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(name)
    } catch {
      // Clipboard can be blocked (non-secure context); the value stays selectable on screen.
    }
  }

  return (
    <div className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-medium">Generated password — shown once. Copy it now; it is not stored anywhere.</p>
      {Object.entries(passwords).map(([name, value]) => (
        <div key={name} className="flex items-center gap-3">
          <span className="text-amber-800">{name}</span>
          <code className="select-all rounded bg-white px-2 py-1 font-mono">{value}</code>
          <button
            type="button"
            onClick={() => copy(name, value)}
            className="rounded border border-amber-400 px-2 py-1 text-xs hover:bg-amber-100"
          >
            {copied === name ? 'Copied' : 'Copy'}
          </button>
        </div>
      ))}
    </div>
  )
}
