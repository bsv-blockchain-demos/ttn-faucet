import { describe, it, expect } from 'vitest'
import { makeArcadePostBeefResult } from './postbeef-result'

describe('makeArcadePostBeefResult', () => {
  it('maps a successful arcade broadcast to a success PostBeefResult', () => {
    const r = makeArcadePostBeefResult(['ab'], { ok: true, alreadyKnown: false, doubleSpend: false, rejected: false, raw: {} })
    expect(r.status).toBe('success')
    expect(r.txidResults[0]).toMatchObject({ txid: 'ab', status: 'success' })
  })
  it('maps a double spend', () => {
    const r = makeArcadePostBeefResult(['ab'], { ok: false, alreadyKnown: false, doubleSpend: true, rejected: false, raw: {} })
    expect(r.status).toBe('error')
    expect(r.txidResults[0].doubleSpend).toBe(true)
  })
  it('marks transport failure as serviceError (retryable)', () => {
    const r = makeArcadePostBeefResult(['ab'], { ok: false, alreadyKnown: false, doubleSpend: false, rejected: false, raw: {} })
    expect(r.txidResults[0].serviceError).toBe(true)
  })
})
