/**
 * The special terms the page explains inline (see TermPill).
 *
 * Terms Beersy's glossary already defines are copied from it word for word (beersy.dev, hand-authored
 * data/glossary-terms.ts), so the faucet and the spec site never disagree about a word, and they link
 * back to it. Terms it doesn't have (the two libraries) are written here in the same shape and link to
 * their source instead.
 */

export const BEERSY = 'https://www.beersy.dev'

export interface Term {
  /** Beersy glossary id, when the term comes from there. */
  id?: string
  term: string
  definition: string
  aliases?: string[]
  /** BRCs that define or lean on the term; linked to beersy.dev/brc/{n}. */
  brcNumbers: number[]
  /** Where "read more" goes: the Beersy glossary entry, the project itself, or nowhere. */
  more?: { label: string; href: string }
}

export const TERMS = {
  atomicBeef: {
    id: 'atomic-beef',
    term: 'Atomic BEEF',
    definition:
      'A BEEF bundle restricted to exactly one subject transaction and its ancestry, for cases where a general bundle of several transactions would be ambiguous about which one matters.',
    brcNumbers: [95],
    more: { label: 'Open in the Beersy glossary', href: `${BEERSY}/glossary#atomic-beef` },
  },
  bsvSdk: {
    term: '@bsv/sdk',
    definition:
      "BSV Blockchain's official TypeScript SDK: keys, scripts, transactions, BEEF and SPV, with no runtime dependencies.",
    aliases: ['ts-sdk'],
    brcNumbers: [],
    more: { label: 'Open on GitHub', href: 'https://github.com/bsv-blockchain/ts-sdk' },
  },
  walletToolbox: {
    term: 'wallet-toolbox',
    definition:
      "The reference toolkit for building BRC-100 wallets: storage, key management and the services a wallet needs to create and track transactions. The faucet's own wallet runs on it.",
    aliases: ['@bsv/wallet-toolbox'],
    brcNumbers: [100],
    more: { label: 'Open on GitHub', href: 'https://github.com/bsv-blockchain/wallet-toolbox' },
  },
} satisfies Record<string, Term>
