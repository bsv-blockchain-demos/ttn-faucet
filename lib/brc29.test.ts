import { describe, it, expect } from 'vitest'
import { PrivateKey, P2PKH } from '@bsv/sdk'
import { deriveBrc29, brc29InvoiceNumber } from './brc29'

describe('BRC-29 derivation', () => {
  it('sender-derived locking script matches the recipient re-derivation', () => {
    const sender = PrivateKey.fromRandom()
    const recipient = PrivateKey.fromRandom()
    const derivationPrefix = 'cHJlZml4'
    const derivationSuffix = 'c3VmZml4'

    const { lockingScriptHex } = deriveBrc29({
      recipientIdentityKeyHex: recipient.toPublicKey().toString(),
      senderPrivateKey: sender,
      derivationPrefix,
      derivationSuffix,
    })

    // Recipient side: derivePrivateKey(counterparty = sender pub, invoiceNumber) -> address -> P2PKH
    const inv = brc29InvoiceNumber(derivationPrefix, derivationSuffix)
    const recipientPriv = recipient.deriveChild(sender.toPublicKey(), inv)
    const expected = new P2PKH().lock(recipientPriv.toAddress()).toHex()

    expect(lockingScriptHex).toBe(expected)
  })

  it('invoice number uses protocol 3241645161d8 and a single-space keyID', () => {
    expect(brc29InvoiceNumber('a', 'b')).toBe('2-3241645161d8-a b')
  })
})
