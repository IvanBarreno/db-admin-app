// csv.test.ts — the CSV text itself (the download is a browser side effect and is not tested here).

import { describe, expect, it } from 'vitest'
import { csvCell, fileSlug, toCsv } from './csv'

describe('csvCell', () => {
  it('leaves plain text alone', () => {
    expect(csvCell('db_datareader')).toBe('db_datareader')
  })

  it('quotes commas, quotes and line breaks, doubling the quotes inside', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"')
  })
})

describe('toCsv', () => {
  it('writes a header line and one CRLF-separated line per row', () => {
    const csv = toCsv(['login_name', 'is_disabled'], [['alice', false], ['bob', true]])

    expect(csv).toBe('login_name,is_disabled\r\nalice,false\r\nbob,true')
  })

  it('writes NULL as an empty field and keeps numbers and zero', () => {
    expect(toCsv(['a', 'b', 'c'], [[null, 0, undefined]])).toBe('a,b,c\r\n,0,')
  })

  it('quotes cells and header names that need it', () => {
    expect(toCsv(['name, full'], [['DOMAIN\\user, the "boss"']])).toBe('"name, full"\r\n"DOMAIN\\user, the ""boss"""')
  })

  it('exports only the header for an empty grid', () => {
    expect(toCsv(['x'], [])).toBe('x')
  })
})

describe('fileSlug', () => {
  it('turns an operation name into a file name', () => {
    expect(fileSlug('Login exists + status')).toBe('login-exists-status')
    expect(fileSlug('IB_LocalSQL · audit.login_status')).toBe('ib-localsql-audit-login-status')
  })

  it('falls back when nothing usable is left', () => {
    expect(fileSlug('···')).toBe('result')
  })
})
