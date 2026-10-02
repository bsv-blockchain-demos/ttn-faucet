import { describe, it, expect, vi } from 'vitest'
import { notifyConnected } from './notify.js'

describe('notifyConnected', () => {
  it('POSTs to the faucet claim endpoint for the session', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }))
    expect(await notifyConnected('http://faucet:3000/', 'ab_C-1', { fetchImpl })).toBe(true)
    expect(fetchImpl).toHaveBeenCalledWith('http://faucet:3000/api/claim/mobile/ab_C-1', expect.objectContaining({ method: 'POST' }))
  })

  it('retries failures, then gives up', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
    expect(await notifyConnected('http://f', 's', { fetchImpl, baseDelayMs: 1 })).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(3)

    const failing = vi.fn(async () => new Response(null, { status: 500 }))
    expect(await notifyConnected('http://f', 's', { fetchImpl: failing, baseDelayMs: 1 })).toBe(false)
    expect(failing).toHaveBeenCalledTimes(3)
  })
})
