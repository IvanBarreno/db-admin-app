import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGeneratePassword } from '../api/secrets'
import {
  FACTORY_PASSWORD_SETTINGS,
  clampLength,
  loadPasswordSettings,
  savePasswordSettings,
  type PasswordSettings,
} from './passwordSettings'

/**
 * Modal to generate a password with chosen options and hand it to the form field BEFORE the operation
 * runs, so the DBA can read, copy and (if needed) retype it. It opens on the app-wide defaults; changes
 * here apply to this password only, unless "save as default" is ticked.
 *
 * Rendered through a portal: the field lives inside a <label>, and clicks inside a dialog nested in a
 * label would be forwarded to the label's input.
 */
export function PasswordGeneratorModal({
  onUse,
  onClose,
}: {
  onUse: (password: string) => void
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [settings, setSettings] = useState<PasswordSettings>(loadPasswordSettings)
  const [saveAsDefault, setSaveAsDefault] = useState(false)
  // The password that was last copied; "Copied" shows only while it is still the current one.
  const [copiedValue, setCopiedValue] = useState('')
  const generate = useGeneratePassword()

  const classCount = [settings.upper, settings.lower, settings.digits, settings.symbols].filter(Boolean).length
  const password = generate.data?.password ?? ''
  const copied = password !== '' && copiedValue === password

  // Native modal dialog: focus trap, Esc to close and backdrop come from the browser.
  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  // Generate on open and whenever an option changes (the key stands for "the options as a value").
  const optionsKey = JSON.stringify(settings)
  const { mutate } = generate
  useEffect(() => {
    if (classCount === 0) return
    mutate(JSON.parse(optionsKey) as PasswordSettings)
  }, [optionsKey, classCount, mutate])

  function change(patch: Partial<PasswordSettings>) {
    setSettings((current) => ({ ...current, ...patch }))
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(password)
      setCopiedValue(password)
    } catch {
      // Clipboard can be blocked (non-secure context); the value stays selectable on screen.
    }
  }

  function use() {
    if (saveAsDefault) savePasswordSettings(settings)
    onUse(password)
  }

  return createPortal(
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()} // click on the backdrop
      className="m-auto w-full max-w-md rounded-lg border border-slate-300 p-0 shadow-xl backdrop:bg-slate-900/40"
    >
      <div className="space-y-4 p-5 text-sm">
        <h3 className="text-base font-semibold text-slate-900">Generate password</h3>

        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <code className="min-h-9 flex-1 select-all break-all rounded border border-slate-300 bg-slate-50 px-2 py-1.5 font-mono">
              {generate.isPending && !password ? '…' : password}
            </code>
            <button type="button" onClick={copy} disabled={!password} className="rounded border border-slate-300 px-2 py-1.5 hover:bg-slate-50 disabled:opacity-50">
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={() => mutate(settings)}
              disabled={classCount === 0 || generate.isPending}
              className="rounded border border-slate-300 px-2 py-1.5 hover:bg-slate-50 disabled:opacity-50"
            >
              New
            </button>
          </div>
          {generate.isError && <p className="text-red-700">{generate.error.message}</p>}
          {classCount === 0 && <p className="text-red-700">Choose at least one kind of character.</p>}
          {generate.data?.warning && <p className="text-amber-700">{generate.data.warning}</p>}
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-3">
            <span className="w-16 text-slate-600">Length</span>
            <input
              type="range"
              min={12}
              max={128}
              value={settings.length}
              onChange={(e) => change({ length: clampLength(Number(e.target.value)) })}
              className="flex-1"
            />
            <input
              type="number"
              min={12}
              max={128}
              value={settings.length}
              onChange={(e) => change({ length: clampLength(Number(e.target.value)) })}
              className="w-16 rounded border border-slate-300 px-2 py-1"
            />
          </label>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <Check label="Upper case (A-Z)" checked={settings.upper} onChange={(upper) => change({ upper })} />
            <Check label="Lower case (a-z)" checked={settings.lower} onChange={(lower) => change({ lower })} />
            <Check label="Digits (0-9)" checked={settings.digits} onChange={(digits) => change({ digits })} />
            <Check label="Symbols (!#$%…)" checked={settings.symbols} onChange={(symbols) => change({ symbols })} />
          </div>
          <Check
            label="Exclude look-alikes (0 O 1 l I)"
            checked={settings.excludeLookalikes}
            onChange={(excludeLookalikes) => change({ excludeLookalikes })}
          />
        </div>

        <div className="space-y-2 border-t border-slate-200 pt-3">
          <Check label="Save these options as the default for the whole app" checked={saveAsDefault} onChange={setSaveAsDefault} />
          <button
            type="button"
            onClick={() => {
              setSettings(FACTORY_PASSWORD_SETTINGS)
              setSaveAsDefault(false)
            }}
            className="text-xs text-slate-500 underline hover:text-slate-700"
          >
            Reset to factory options
          </button>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => dialog.current?.close()} className="rounded border border-slate-300 px-4 py-2 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={use}
            disabled={!password || generate.isPending || classCount === 0}
            className="rounded bg-slate-800 px-4 py-2 font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            Use this password
          </button>
        </div>
      </div>
    </dialog>,
    document.body,
  )
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}
