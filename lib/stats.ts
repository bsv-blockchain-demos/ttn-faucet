import { prisma } from './prisma'

export interface FaucetStats {
  /** Number of successful payouts ever made (broadcast claims). */
  payoutCount: number
  /** Total satoshis disbursed across all successful payouts. */
  totalSatsDisbursed: number
}

/** Aggregate lifetime faucet stats from broadcast Claim rows. Powers the public stats grid. */
export async function getFaucetStats(): Promise<FaucetStats> {
  const [payoutCount, agg] = await Promise.all([
    prisma.claim.count({ where: { status: 'broadcast' } }),
    prisma.claim.aggregate({ where: { status: 'broadcast' }, _sum: { amountSats: true } }),
  ])
  return { payoutCount, totalSatsDisbursed: agg._sum.amountSats ?? 0 }
}
