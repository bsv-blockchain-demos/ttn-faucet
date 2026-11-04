import { describe, it, expect } from 'vitest'
import { clientIp } from './client-ip'

const ip = (headers: Record<string, string>) => clientIp(new Headers(headers))

describe('clientIp', () => {
  it('prefers CF-Connecting-IP over X-Forwarded-For, and hands it on for siteverify', () => {
    expect(ip({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '10.0.0.5, 10.0.0.1' })).toEqual({
      ip: '203.0.113.7',
      remoteIp: '203.0.113.7',
    })
  })

  it('falls back to the first X-Forwarded-For entry, with no remoteIp', () => {
    expect(ip({ 'x-forwarded-for': ' 198.51.100.4 , 10.0.0.1' })).toEqual({ ip: '198.51.100.4' })
  })

  it("is 'unknown', with no remoteIp, when neither header is there", () => {
    expect(ip({})).toEqual({ ip: 'unknown' })
  })

  it('trims surrounding whitespace', () => {
    expect(ip({ 'cf-connecting-ip': '  203.0.113.7\t' })).toEqual({ ip: '203.0.113.7', remoteIp: '203.0.113.7' })
  })

  it('takes IPv6 from either header', () => {
    expect(ip({ 'cf-connecting-ip': '2001:db8::1' })).toEqual({ ip: '2001:db8::1', remoteIp: '2001:db8::1' })
    expect(ip({ 'x-forwarded-for': '2001:db8::2, 10.0.0.1' })).toEqual({ ip: '2001:db8::2' })
    expect(ip({ 'cf-connecting-ip': '::ffff:203.0.113.7' }).ip).toBe('::ffff:203.0.113.7')
  })

  it('falls through an invalid CF-Connecting-IP to X-Forwarded-For', () => {
    for (const bad of ['', '   ', 'unknown', 'not-an-ip', '203.0.113.7:443', '[2001:db8::1]', '999.1.1.1', '203.0.113.7, 10.0.0.1']) {
      expect(ip({ 'cf-connecting-ip': bad, 'x-forwarded-for': '198.51.100.4' }), bad).toEqual({ ip: '198.51.100.4' })
    }
  })

  it("is 'unknown' when the first X-Forwarded-For entry is invalid, without trying later entries", () => {
    expect(ip({ 'x-forwarded-for': 'garbage, 198.51.100.4' })).toEqual({ ip: 'unknown' })
    expect(ip({ 'x-forwarded-for': '198.51.100.4:5678' })).toEqual({ ip: 'unknown' })
    expect(ip({ 'x-forwarded-for': '' })).toEqual({ ip: 'unknown' })
    expect(ip({ 'cf-connecting-ip': 'nope', 'x-forwarded-for': 'nope' })).toEqual({ ip: 'unknown' })
  })
})
