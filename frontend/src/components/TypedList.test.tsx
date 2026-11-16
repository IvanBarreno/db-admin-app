// TypedList.test.tsx — the "paste a list of names" box: what it reports to the form and when it blocks it.

import { cleanup, fireEvent, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OperationParameter } from '../api/operations'
import { renderWithMantine } from '../test/render'
import { TypedList } from './TypedList'

const param = { name: 'login_names', type: 'String', required: true, multi: true, label: 'Login names' } as unknown as OperationParameter

const onChange = vi.fn()
const onBlock = vi.fn()

/** Owns the value like ParamForm does; the button plays "the form was cleared from outside". */
function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <TypedList
        param={param}
        value={value}
        onBlock={onBlock}
        onChange={(v) => {
          onChange(v)
          setValue(v)
        }}
      />
      <button type="button" onClick={() => setValue('')}>
        clear form
      </button>
    </>
  )
}

const box = () => screen.getByRole('textbox') as HTMLTextAreaElement

afterEach(() => {
  cleanup()
  onChange.mockReset()
  onBlock.mockReset()
})

describe('TypedList', () => {
  it('reports the typed names as a JSON list, trimmed and without duplicates', () => {
    renderWithMantine(<Harness />)

    fireEvent.change(box(), { target: { value: 'app_a\n app_b \napp_a' } })

    expect(onChange).toHaveBeenLastCalledWith('["app_a","app_b"]')
    expect(screen.getByText('2 names')).toBeTruthy()
    expect(box().value).toBe('app_a\n app_b \napp_a') // the text itself is left as typed
  })

  it('shows a value that is already in the form, one name per line', () => {
    renderWithMantine(<Harness initial='["x","y"]' />)

    expect(box().value).toBe('x\ny')
  })

  it('blocks the form while a required list is empty and unblocks once a name is typed', () => {
    renderWithMantine(<Harness />)
    expect(onBlock).toHaveBeenLastCalledWith('login_names', expect.stringContaining('at least one name'))

    fireEvent.change(box(), { target: { value: 'app_a' } })

    expect(onBlock).toHaveBeenLastCalledWith('login_names', null)
  })

  it('empties the box when the form is cleared from outside', () => {
    renderWithMantine(<Harness />)
    fireEvent.change(box(), { target: { value: 'app_a\napp_b' } })

    fireEvent.click(screen.getByText('clear form'))

    expect(box().value).toBe('')
  })

  it('reports an empty value (not "[]") when everything is deleted', () => {
    renderWithMantine(<Harness initial='["x"]' />)

    fireEvent.change(box(), { target: { value: '  \n' } })

    expect(onChange).toHaveBeenLastCalledWith('')
  })
})
