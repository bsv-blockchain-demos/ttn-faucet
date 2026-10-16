/**
 * The test networks this faucet can pay out on. Shared by server and browser code (no secrets).
 *
 * BRC-100 `getNetwork` only answers 'mainnet' | 'testnet' — every test chain reports 'testnet' —
 * so the wallet can't tell us which one it is on. The visitor picks the network instead, and the
 * page uses `getNetwork` only to stop a mainnet wallet from claiming.
 */

export const NETWORK_IDS = ['testnet', 'ttn', 'tstn'] as const
export type NetworkId = (typeof NETWORK_IDS)[number]

export interface NetworkInfo {
  id: NetworkId
  /** Display name, e.g. in the network picker and status messages. */
  name: string
  /** One line telling the networks apart in the picker. */
  blurb: string
  /** @bsv/wallet-toolbox chain for the faucet's server wallet. */
  chain: 'test' | 'ttn' | 'tstn'
  /** Env var prefix for this network's server config, e.g. `TTN_ARCADE_URL`. */
  envPrefix: string
  /** Block explorer base URL (serves /tx/{txid}), when one exists. */
  explorer?: string
}

export const NETWORKS: Record<NetworkId, NetworkInfo> = {
  testnet: {
    id: 'testnet',
    name: 'Testnet',
    blurb: 'The public BSV test network',
    chain: 'test',
    envPrefix: 'TESTNET',
    explorer: 'https://test.whatsonchain.com',
  },
  ttn: {
    id: 'ttn',
    name: 'Teratestnet',
    blurb: 'Teranode test network',
    chain: 'ttn',
    envPrefix: 'TTN',
    explorer: 'https://woc-ttn.bsvblockchain.tech',
  },
  tstn: {
    id: 'tstn',
    name: 'Teranode STN',
    blurb: 'Teranode scaling test network',
    chain: 'tstn',
    envPrefix: 'TSTN',
  },
}

/** The network the page starts on when the visitor hasn't picked one yet. */
export const DEFAULT_NETWORK: NetworkId = 'testnet'

export function isNetworkId(v: unknown): v is NetworkId {
  return typeof v === 'string' && (NETWORK_IDS as readonly string[]).includes(v)
}

/** Explorer link for a transaction, or null when the network has no explorer. */
export function txUrl(network: NetworkId, txid: string): string | null {
  const base = NETWORKS[network].explorer
  return base ? `${base}/tx/${txid}` : null
}
