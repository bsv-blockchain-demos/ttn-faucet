import { prisma } from './prisma'

export interface RateLimitOptions {
  subject: string
  limit: number
  windowMs: number
}
export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterMs: number
}

/** Sliding window: count events for subject within the window; record one if allowed. */
export async function checkAndRecord(opts: RateLimitOptions): Promise<RateLimitResult> {
  const now = Date.now()
  const cutoff = new Date(now - opts.windowMs)
  const events = await prisma.rateEvent.findMany({
    where: { subject: opts.subject, createdAt: { gt: cutoff } },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  })
  if (events.length >= opts.limit) {
    const oldest = events[0].createdAt.getTime()
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, oldest + opts.windowMs - now) }
  }
  await prisma.rateEvent.create({ data: { subject: opts.subject, kind: 'claim' } })
  return { allowed: true, remaining: opts.limit - events.length - 1, retryAfterMs: 0 }
}
