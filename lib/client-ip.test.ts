import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

  it("puts Cloudflare's cross-zone Worker address in the shared 'cf-worker' bucket, ignoring X-Forwarded-For", () => {
    expect(ip({ 'cf-connecting-ip': '2a06:98c0:3600::103', 'x-forwarded-for': '198.51.100.4' })).toEqual({ ip: 'cf-worker' })
    expect(ip({ 'cf-connecting-ip': '2a06:98c0:3600::103', 'x-forwarded-for': '198.51.100.5' })).toEqual({ ip: 'cf-worker' })
    expect(ip({ 'cf-connecting-ip': '2a06:98c0:3600::103' })).toEqual({ ip: 'cf-worker' })
  })

  it('recognises other spellings of the Worker address, with a port too', () => {
    for (const w of [
      '2A06:98C0:3600::103',
      '2a06:98c0:3600:0:0:0:0:103',
      '2a06:98c0:3600:0000::0103',
      ' 2a06:98c0:3600::103 ',
      '[2a06:98c0:3600::103]:443',
    ]) {
      expect(ip({ 'cf-connecting-ip': w, 'x-forwarded-for': '198.51.100.4' }), w).toEqual({ ip: 'cf-worker' })
    }
  })

  it('does not treat addresses next to the Worker address as the Worker', () => {
    expect(ip({ 'cf-connecting-ip': '2a06:98c0:3600::104' })).toEqual({
      ip: '2a06:98c0:3600:0::/64',
      remoteIp: '2a06:98c0:3600::104',
    })
  })

  it('drops a port from X-Forwarded-For, IPv4 and bracketed IPv6', () => {
    expect(ip({ 'x-forwarded-for': '198.51.100.4:5678, 10.0.0.1' })).toEqual({ ip: '198.51.100.4' })
    expect(ip({ 'x-forwarded-for': '[2001:db8:1:2::1]:443' })).toEqual({ ip: '2001:db8:1:2::/64' })
    expect(ip({ 'x-forwarded-for': '[2001:db8:1:2::1]' })).toEqual({ ip: '2001:db8:1:2::/64' })
  })

  it('drops a port from CF-Connecting-IP, and sends siteverify the bare address', () => {
    expect(ip({ 'cf-connecting-ip': '203.0.113.7:443' })).toEqual({ ip: '203.0.113.7', remoteIp: '203.0.113.7' })
    expect(ip({ 'cf-connecting-ip': '[2001:db8::1]:443' })).toEqual({ ip: '2001:db8:0:0::/64', remoteIp: '2001:db8::1' })
  })

  it('falls through an invalid CF-Connecting-IP to X-Forwarded-For', () => {
    for (const bad of ['', '   ', 'unknown', 'not-an-ip', '999.1.1.1', '999.1.1.1:80', '[not-an-ip]:443', '2001:db8::1:443:x', '203.0.113.7, 10.0.0.1']) {
      expect(ip({ 'cf-connecting-ip': bad, 'x-forwarded-for': '198.51.100.4' }), bad).toEqual({ ip: '198.51.100.4' })
    }
  })

  it("is 'unknown' when the first X-Forwarded-For entry is invalid, without trying later entries", () => {
    expect(ip({ 'x-forwarded-for': 'garbage, 198.51.100.4' })).toEqual({ ip: 'unknown' })
    expect(ip({ 'x-forwarded-for': '198.51.100.4:port' })).toEqual({ ip: 'unknown' })
    expect(ip({ 'x-forwarded-for': '' })).toEqual({ ip: 'unknown' })
    expect(ip({ 'cf-connecting-ip': 'nope', 'x-forwarded-for': 'nope' })).toEqual({ ip: 'unknown' })
  })
})

describe('clientIp shared-bucket warning', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.restoreAllMocks())

  const load = async () => (await import('./client-ip')).clientIp
  const h = (headers: Record<string, string>) => new Headers(headers)

  it("warns once per process for 'unknown' and once for 'cf-worker', with no address in the line", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const clientIp = await load()
    clientIp(h({}))
    clientIp(h({ 'x-forwarded-for': 'garbage' }))
    clientIp(h({ 'cf-connecting-ip': '2a06:98c0:3600::103', 'x-forwarded-for': '198.51.100.4' }))
    clientIp(h({ 'cf-connecting-ip': '2a06:98c0:3600::103' }))
    expect(warn).toHaveBeenCalledTimes(2)
    const lines = warn.mock.calls.map((c) => String(c[0]))
    expect(lines.some((l) => l.includes("'unknown'"))).toBe(true)
    expect(lines.some((l) => l.includes("'cf-worker'"))).toBe(true)
    for (const l of lines) expect(l).not.toMatch(/198\.51|2a06|garbage/)
  })

  it('does not warn for a request keyed on a visitor address', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const clientIp = await load()
    clientIp(h({ 'cf-connecting-ip': '203.0.113.7' }))
    clientIp(h({ 'x-forwarded-for': '198.51.100.4' }))
    expect(warn).not.toHaveBeenCalled()
  })
})
