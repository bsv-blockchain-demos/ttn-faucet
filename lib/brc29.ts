import { PrivateKey, PublicKey, P2PKH, Random, Utils } from '@bsv/sdk'

export const BRC29_PROTOCOL_HEX = '3241645161d8'

/** Invoice number form used by BRC-29 / type-42: `2-3241645161d8-<prefix> <suffix>` (single space). */
export function brc29InvoiceNumber(derivationPrefix: string, derivationSuffix: string): string {
  return `2-${BRC29_PROTOCOL_HEX}-${derivationPrefix} ${derivationSuffix}`
}

/** Generate fresh per-payment derivation values (16 random bytes, base64), matching the toolbox convention. */
export function newDerivationValues(): { derivationPrefix: string; derivationSuffix: string } {
  return {
    derivationPrefix: Utils.toBase64(Random(16)),
    derivationSuffix: Utils.toBase64(Random(16)),
  }
}

export interface DeriveBrc29Args {
  recipientIdentityKeyHex: string
  senderPrivateKey: PrivateKey
  derivationPrefix: string
  derivationSuffix: string
}

/**
 * Sender-side BRC-29 derivation: compute the P2PKH locking script payable to `recipient`,
 * such that the recipient wallet can re-derive the spending key from
 * (senderIdentityKey, derivationPrefix, derivationSuffix). BRC-42 symmetry guarantees the
 * sender-derived public key equals the recipient-derived private key's public key.
 */
export function deriveBrc29(args: DeriveBrc29Args): {
  lockingScriptHex: string
  senderIdentityKeyHex: string
} {
  const inv = brc29InvoiceNumber(args.derivationPrefix, args.derivationSuffix)
  const recipientPub = PublicKey.fromString(args.recipientIdentityKeyHex)
  const derivedPub = recipientPub.deriveChild(args.senderPrivateKey, inv)
  const lockingScriptHex = new P2PKH().lock(derivedPub.toAddress()).toHex()
  return {
    lockingScriptHex,
    senderIdentityKeyHex: args.senderPrivateKey.toPublicKey().toString(),
  }
}
