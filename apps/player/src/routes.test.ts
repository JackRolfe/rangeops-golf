import { describe, expect, it } from 'vitest'
import { parseLink } from './routes'
import { bytesToBase64url } from './robot/protocol'

const key = new Uint8Array(78).map((_, index) => index * 3)
const hire = bytesToBase64url(key)

describe('parseLink', () => {
  it.each([
    ['/app/', '/app/signin', '?token=abc'],
    ['/', '/app/signin', '?token=abc'],
    ['/', '/signin', '?token=abc'],
    ['/rangeops-golf/app/', '/rangeops-golf/app/signin', '?token=abc'],
  ])('reads a sign-in link under base %s (%s)', (base, path, search) => {
    expect(parseLink(path, search, base)).toEqual({ kind: 'signin', token: 'abc' })
  })

  it('reads a hire link into the 78-byte key', () => {
    const link = parseLink('/app/drive', `?hire=${hire}`, '/app/')
    expect(link).toEqual({ kind: 'drive', hireKey: key })
  })

  it('rejects a hire link that is not a hire key', () => {
    expect(parseLink('/app/drive', '?hire=***', '/app/')).toEqual({ kind: 'bad-hire-link' })
    expect(parseLink('/app/drive', `?hire=${bytesToBase64url(key.slice(1))}`, '/app/')).toEqual({ kind: 'bad-hire-link' })
  })

  it('reads a check-in code', () => {
    expect(parseLink('/app/check-in/9f2c1a', '', '/app/')).toEqual({ kind: 'check-in', code: '9f2c1a' })
    expect(parseLink('/check-in/9f2c1a', '', '/')).toEqual({ kind: 'check-in', code: '9f2c1a' })
  })

  it('treats anything else as the home screen', () => {
    for (const [path, search] of [['/app/', ''], ['/app', ''], ['/', ''], ['/app/signin', ''], ['/app/elsewhere', ''], ['/app/check-in', '']]) {
      expect(parseLink(path, search, '/app/')).toEqual({ kind: 'home' })
    }
  })
})
