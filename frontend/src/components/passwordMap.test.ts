// passwordMap.test.ts — the "one password per login" value the form sends (typed passwords only).

import { describe, expect, it } from 'vitest'
import { encodePasswordMap, parsePasswordMap } from './passwordMap'

describe('parsePasswordMap', () => {
  it('reads a JSON object of name → password and drops blank passwords', () => {
    expect(parsePasswordMap('{"alice":"S3cret!","bob":""}')).toEqual({ alice: 'S3cret!' })
  })

  it('treats anything else as "none typed"', () => {
    expect(parsePasswordMap(undefined)).toEqual({})
    expect(parsePasswordMap('')).toEqual({})
    expect(parsePasswordMap('["alice"]')).toEqual({}) // a list is not a map
    expect(parsePasswordMap('not json')).toEqual({})
    expect(parsePasswordMap('{"alice":5}')).toEqual({}) // not a string
  })
})

describe('encodePasswordMap', () => {
  it('keeps only the names still in the list, in list order', () => {
    const text = encodePasswordMap({ carol: 'c', alice: 'a', ghost: 'g' }, ['alice', 'bob', 'carol'])

    // Same choices → same text, whatever order they were typed in: the confirm token is bound to this text.
    expect(text).toBe('{"alice":"a","carol":"c"}')
  })

  it('is the empty string when no password is typed (= generate all of them)', () => {
    expect(encodePasswordMap({}, ['alice'])).toBe('')
    expect(encodePasswordMap({ ghost: 'g' }, ['alice'])).toBe('')
  })
})
