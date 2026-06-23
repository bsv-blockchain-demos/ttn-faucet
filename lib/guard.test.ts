import { describe, it, expect } from 'vitest'
import { hashIp } from './guard'

describe('hashIp', () => {
  it('is deterministic and not the raw IP', () => {
    const a = hashIp('1.2.3.4')
    const b = hashIp('1.2.3.4')
    expect(a).toBe(b)
    expect(a).not.toContain('1.2.3.4')
    expect(a).toHaveLength(64) // sha256 hex
  })
})
