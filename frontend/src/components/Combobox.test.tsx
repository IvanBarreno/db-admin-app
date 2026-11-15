// Combobox.test.tsx — keyboard and mouse behaviour of the app's own combobox (WAI-ARIA pattern).
// The component is "controlled" (the parent owns the value), so a tiny Harness keeps the value in state,
// exactly like ParamForm does. Events are sent with fireEvent: one DOM event per call, no extra library.

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

const input = () => screen.getByRole('combobox') as HTMLInputElement
/** Names in the popup, in display order (empty when it is closed). */
const options = () => screen.queryAllByRole('option').map((o) => o.querySelector('span')?.textContent)
const key = (k: string) => fireEvent.keyDown(input(), { key: k })

afterEach(() => {
  cleanup() // unmount between tests (Vitest runs without globals, so RTL does not do it by itself)
  onChange.mockReset()
})

describe('Combobox', () => {
  it('is closed until focused, then shows the whole list', () => {
    render(<Harness />)
    expect(options()).toEqual([])
    expect(input().getAttribute('aria-expanded')).toBe('false')

    fireEvent.focus(input())

    expect(options()).toEqual(['alice', 'app_login', 'bob', 'carol'])
    expect(input().getAttribute('aria-expanded')).toBe('true')
  })

  it('does not narrow the list by a value that is already in the box', () => {
    // The datalist bug from round 3: with "bob" in the field it looked as if only bob existed.
    render(<Harness initial="bob" />)

    fireEvent.focus(input())

    expect(options()).toHaveLength(4)
  })

  it('narrows the list once the DBA types, matching names and hints', () => {
    render(<Harness />)
    fireEvent.focus(input())

    fireEvent.change(input(), { target: { value: 'CAR' } }) // case-insensitive, by name
    expect(options()).toEqual(['carol'])

    fireEvent.change(input(), { target: { value: 'windows' } }) // by hint text
    expect(options()).toEqual(['bob'])
  })

  it('hides the popup when nothing matches but keeps the typed text (free typing)', () => {
    render(<Harness />)
    fireEvent.focus(input())

    fireEvent.change(input(), { target: { value: 'zz_new_login' } })

    expect(options()).toEqual([])
    expect(input().value).toBe('zz_new_login')
    expect(onChange).toHaveBeenLastCalledWith('zz_new_login')
  })

  it('picks the highlighted row with Enter and closes', () => {
    render(<Harness />)
    fireEvent.focus(input()) // highlight starts on the first row

    key('Enter')

    expect(input().value).toBe('alice')
    expect(options()).toEqual([])
  })

  it('moves the highlight with the arrows and stops at both ends', () => {
    render(<Harness />)
    fireEvent.focus(input())

    key('ArrowUp') // already on the first row: stays
    key('ArrowDown')
    key('ArrowDown')
    key('ArrowDown')
    key('ArrowDown') // one more than the list has: stays on the last
    key('Enter')
    expect(input().value).toBe('carol')

    fireEvent.focus(input())
    key('ArrowUp')
    key('Enter')
    expect(input().value).toBe('bob')
  })

  it('does not pick a locked row, by keyboard or by mouse', () => {
    render(<Harness />)
    fireEvent.focus(input())

    key('ArrowDown') // app_login (locked)
    key('Enter')
    fireEvent.mouseDown(screen.getByText('app_login'))

    expect(onChange).not.toHaveBeenCalled()
    expect(input().value).toBe('')
    expect(options()).toHaveLength(4) // still open: nothing was chosen
    expect(screen.getByText('app_login').closest('li')?.getAttribute('aria-disabled')).toBe('true')
  })

  it('shows why a row is locked instead of its hint', () => {
    render(<Harness />)
    fireEvent.focus(input())

    expect(screen.getByText(/view only — the account this app connects with/)).toBeTruthy()
  })

  it('picks a row with the mouse', () => {
    render(<Harness />)
    fireEvent.focus(input())

    fireEvent.mouseDown(screen.getByText('bob'))

    expect(input().value).toBe('bob')
    expect(options()).toEqual([])
  })

  it('closes with Escape without changing the value, and ArrowDown opens it again', () => {
    render(<Harness initial="bob" />)
    fireEvent.focus(input())

    key('Escape')
    expect(options()).toEqual([])
    expect(input().value).toBe('bob')

    key('ArrowDown')
    expect(options()).toHaveLength(4)
  })

  it('Enter does nothing while the popup is closed', () => {
    render(<Harness />)
    fireEvent.focus(input())
    key('Escape')

    key('Enter')

    expect(onChange).not.toHaveBeenCalled()
  })

  it('closes when the field loses focus', () => {
    render(<Harness />)
    fireEvent.focus(input())

    fireEvent.blur(input())

    expect(options()).toEqual([])
  })

  it('the ▾ button toggles the full list, even after typing narrowed it', () => {
    render(<Harness />)
    fireEvent.focus(input())
    fireEvent.change(input(), { target: { value: 'car' } })
    const button = screen.getByLabelText('Show the list')

    fireEvent.mouseDown(button) // closes
    expect(options()).toEqual([])

    fireEvent.mouseDown(button) // opens again, unfiltered
    expect(options()).toHaveLength(4)
  })

  it('a disabled combobox never opens, and the button is off without items', () => {
    render(<Harness disabled />)
    fireEvent.focus(input())
    expect(options()).toEqual([])
    cleanup()

    render(<Harness list={[]} />)
    expect((screen.getByLabelText('Show the list') as HTMLButtonElement).disabled).toBe(true)
  })

  it('keeps the browser and password managers away from the field', () => {
    // Round 3 finding 2: Chrome's password manager replaced the list next to a password input.
    render(<Harness />)

    expect(input().getAttribute('autocomplete')).toBe('off')
    expect(input().getAttribute('data-lpignore')).toBe('true')
    expect(input().getAttribute('data-1p-ignore')).toBe('true')
  })
})
