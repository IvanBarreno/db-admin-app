// Combobox.test.tsx — behaviour of the app's picker (Combobox.tsx, built on Mantine's Combobox primitives).
// The component is "controlled" (the parent owns the value), so a tiny Harness keeps the value in state,
// exactly like ParamForm does. Events are sent with fireEvent: one DOM event per call, no extra library.
//
// What is OURS and therefore tested here: which rows are shown and when, that locked rows cannot be picked,
// that free typing survives, and the attributes that keep password managers away. Positioning, ARIA wiring
// and the arrow-key mechanics belong to Mantine.

import { cleanup, fireEvent, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithMantine } from '../test/render'
import { Combobox, type ComboItem } from './Combobox'

const items: ComboItem[] = [
  { value: 'alice', hint: 'sql login' },
  { value: 'app_login', locked: 'view only — the account this app connects with' },
  { value: 'bob', hint: 'windows login, disabled' },
  { value: 'carol', hint: 'sql login' },
]

/** Spy that sees every value the combobox reports, in order. */
const onChange = vi.fn()

function Harness({ initial = '', list = items, disabled = false }: { initial?: string; list?: ComboItem[]; disabled?: boolean }) {
  const [value, setValue] = useState(initial)
  return (
    <Combobox
      value={value}
      items={list}
      disabled={disabled}
      onChange={(v) => {
        onChange(v)
        setValue(v)
      }}
    />
  )
}

const input = () => screen.getByRole('textbox') as HTMLInputElement
/** Names in the dropdown, in display order (empty when it is closed). The name is the first text of each option. */
const options = () => screen.queryAllByRole('option').map((o) => o.querySelector('p')?.textContent)
const option = (name: string) => screen.getAllByRole('option').find((o) => o.querySelector('p')?.textContent === name)!
// Mantine reads the PHYSICAL key (`event.code`), so both fields are sent, as a real keyboard does.
const key = (k: string) => fireEvent.keyDown(input(), { key: k, code: k })

afterEach(() => {
  cleanup() // unmount between tests (Vitest runs without globals, so RTL does not do it by itself)
  onChange.mockReset()
})

describe('Combobox', () => {
  it('is closed until focused, then shows the whole list', () => {
    renderWithMantine(<Harness />)
    expect(options()).toEqual([])

    fireEvent.focus(input())

    expect(options()).toEqual(['alice', 'app_login', 'bob', 'carol'])
  })

  it('does not narrow the list by a value that is already in the box', () => {
    // The datalist bug from round 3: with "bob" in the field it looked as if only bob existed.
    renderWithMantine(<Harness initial="bob" />)

    fireEvent.focus(input())

    expect(options()).toHaveLength(4)
  })

  it('narrows the list once the DBA types, matching names and hints', () => {
    renderWithMantine(<Harness />)
    fireEvent.focus(input())

    fireEvent.change(input(), { target: { value: 'CAR' } }) // case-insensitive, by name
    expect(options()).toEqual(['carol'])

    fireEvent.change(input(), { target: { value: 'windows' } }) // by hint text
    expect(options()).toEqual(['bob'])
  })

  it('keeps the typed text when nothing matches (free typing)', () => {
    renderWithMantine(<Harness />)
    fireEvent.focus(input())

    fireEvent.change(input(), { target: { value: 'zz_new_login' } })

    expect(options()).toEqual([])
    expect(input().value).toBe('zz_new_login')
    expect(onChange).toHaveBeenLastCalledWith('zz_new_login')
  })

  it('picks a row with the mouse and closes', () => {
    renderWithMantine(<Harness />)
    fireEvent.focus(input())

    fireEvent.click(option('bob'))

    expect(input().value).toBe('bob')
    expect(options()).toEqual([])
  })

  it('does not pick a locked row, and says why it is locked', () => {
    renderWithMantine(<Harness />)
    fireEvent.focus(input())

    fireEvent.click(option('app_login'))

    expect(onChange).not.toHaveBeenCalled()
    expect(input().value).toBe('')
    expect(option('app_login').getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText(/view only — the account this app connects with/)).toBeTruthy()
  })

  it('picks with the keyboard, skipping the locked row', () => {
    renderWithMantine(<Harness />)
    fireEvent.focus(input())

    key('ArrowDown') // alice
    key('ArrowDown') // app_login is locked: the highlight goes on to bob
    key('Enter')

    expect(input().value).toBe('bob')
  })

  it('closes with Escape without changing the value', () => {
    renderWithMantine(<Harness initial="bob" />)
    fireEvent.focus(input())

    key('Escape')

    expect(options()).toEqual([])
    expect(input().value).toBe('bob')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('closes when the field loses focus', () => {
    renderWithMantine(<Harness />)
    fireEvent.focus(input())

    fireEvent.blur(input())

    expect(options()).toEqual([])
  })

  it('a disabled combobox never opens', () => {
    renderWithMantine(<Harness disabled />)

    fireEvent.focus(input())

    expect(options()).toEqual([])
    expect(input().disabled).toBe(true)
  })

  it('keeps the browser and password managers away from the field', () => {
    // Round 3 finding 2: Chrome's password manager replaced the list next to a password input.
    renderWithMantine(<Harness />)

    expect(input().getAttribute('autocomplete')).toBe('off')
    expect(input().getAttribute('data-lpignore')).toBe('true')
    expect(input().getAttribute('data-1p-ignore')).toBe('true')
  })
})
