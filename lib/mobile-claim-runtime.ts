import { MobileClaims } from './mobile-claim'
import { createRelaySession, getRelayStatus, relayCall } from './relay-api'
import { guard, hashIp } from './guard'
import { claimToWallet, findUndeliveredPayout, hasPayoutInFlight, markDelivered } from './faucet'
import { freshAtomicBeef, payToWallet } from './wallet'

/**
 * Backstop for the relay's connect webhook: check waiting claims this often. On one phone the
 * browser is frozen while the wallet is open, so the server must notice the connect by itself.
 */
const SWEEP_MS = 1500

// One instance per server process, shared by every route bundle and surviving dev HMR.
const g = globalThis as unknown as { __faucetMobileClaims?: MobileClaims }

export function mobileClaims(): MobileClaims {
  if (!g.__faucetMobileClaims) {
    const claims = new MobileClaims({
      createSession: createRelaySession,
      getStatus: getRelayStatus,
      call: relayCall,
      guard: (ip) => guard({ ip }),
      pay: (identityKey, ip) =>
        claimToWallet({ identityKey, ipHash: hashIp(ip), recordRemittance: true }, { payWallet: payToWallet }),
      findUndelivered: findUndeliveredPayout,
      refreshBeef: freshAtomicBeef,
      markDelivered,
      hasPayoutInFlight: (identityKey) => hasPayoutInFlight(identityKey),
      log: (msg) => console.log(msg),
    })
    setInterval(() => void claims.sweep().catch(() => {}), SWEEP_MS).unref()
    g.__faucetMobileClaims = claims
  }
  return g.__faucetMobileClaims
}
