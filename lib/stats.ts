import { prisma } from './prisma'
import type { NetworkId } from './networks'

export interface FaucetStats {
  /** Number of successful payouts ever made (broadcast claims). */
  payoutCount: number
  /** Total satoshis disbursed across all successful payouts. */
  totalSatsDisbursed: number
}

/** Aggregate lifetime faucet stats from broadcast Claim rows, for one network or all. Powers the public stats grid. */
export async function getFaucetStats(network?: NetworkId): Promise<FaucetStats> {
  const where = { status: 'broadcast', ...(network ? { network } : {}) }
  const [payoutCount, agg] = await Promise.all([
    prisma.claim.count({ where }),
    prisma.claim.aggregate({ where, _sum: { amountSats: true } }),
  ])
  return { payoutCount, totalSatsDisbursed: agg._sum.amountSats ?? 0 }
}
