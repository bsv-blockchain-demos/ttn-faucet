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

  it('takes IPv6 from either header, keyed on its /64, with the full address as remoteIp', () => {
    expect(ip({ 'cf-connecting-ip': '2001:db8::1' })).toEqual({ ip: '2001:db8:0:0::/64', remoteIp: '2001:db8::1' })
    expect(ip({ 'x-forwarded-for': '2001:db8:1:2:3:4:5:6, 10.0.0.1' })).toEqual({ ip: '2001:db8:1:2::/64' })
  })

  it('gives two addresses in one /64 the same key, and different /64s different keys', () => {
    const a = ip({ 'cf-connecting-ip': '2001:db8:aa:bb:1111:2222:3333:4444' })
    const b = ip({ 'cf-connecting-ip': '2001:0DB8:00aa:bb::9' })
    const c = ip({ 'cf-connecting-ip': '2001:db8:aa:bc:1111:2222:3333:4444' })
    expect(a.ip).toBe('2001:db8:aa:bb::/64')
    expect(b.ip).toBe(a.ip)
    expect(c.ip).not.toBe(a.ip)
    expect([a.remoteIp, b.remoteIp]).toEqual(['2001:db8:aa:bb:1111:2222:3333:4444', '2001:0DB8:00aa:bb::9'])
  })

  it('keys IPv4-mapped IPv6 on the IPv4 address, in either spelling', () => {
    expect(ip({ 'cf-connecting-ip': '::ffff:203.0.113.7' })).toEqual({ ip: '203.0.113.7', remoteIp: '::ffff:203.0.113.7' })
    expect(ip({ 'cf-connecting-ip': '::ffff:cb00:7107' }).ip).toBe('203.0.113.7')
    expect(ip({ 'x-forwarded-for': '0:0:0:0:0:ffff:203.0.113.7' })).toEqual({ ip: '203.0.113.7' })
  })

  it("skips Cloudflare's cross-zone Worker address and falls through to X-Forwarded-For, with no remoteIp", () => {
    expect(ip({ 'cf-connecting-ip': '2a06:98c0:3600::103', 'x-forwarded-for': '198.51.100.4' })).toEqual({
      ip: '198.51.100.4',
    })
    expect(ip({ 'cf-connecting-ip': '2a06:98c0:3600::103' })).toEqual({ ip: 'unknown' })
  })

  it('recognises other spellings of the Worker address', () => {
    for (const w of ['2A06:98C0:3600::103', '2a06:98c0:3600:0:0:0:0:103', '2a06:98c0:3600:0000::0103', ' 2a06:98c0:3600::103 ']) {
      expect(ip({ 'cf-connecting-ip': w, 'x-forwarded-for': '198.51.100.4' }), w).toEqual({ ip: '198.51.100.4' })
    }
  })

  it('does not skip addresses next to the Worker address', () => {
    expect(ip({ 'cf-connecting-ip': '2a06:98c0:3600::104' })).toEqual({
      ip: '2a06:98c0:3600:0::/64',
      remoteIp: '2a06:98c0:3600::104',
    })
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
