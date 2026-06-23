import { createHash } from 'node:crypto'
import { prisma } from './prisma'
import { getConfig } from './config'
import { verifyTurnstile } from './turnstile'
import { checkAndRecord } from './rate-limit'

export function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex')
}

export interface GuardContext {
  ip: string
  captchaToken?: string
  apiKey?: string
}
export type GuardResult =
  | { ok: true; subject: string; apiKeyId?: string }
  | { ok: false; code: 'captcha' | 'rate_limit' | 'unauthorized'; status: number; retryAfterMs?: number; message: string }

/**
 * Order: if a valid API key is presented, skip captcha and apply a higher limit.
 * Otherwise require a passing Turnstile token, then apply the per-IP rate limit.
 */
export async function guard(ctx: GuardContext): Promise<GuardResult> {
  const cfg = getConfig()

  // API key path
  if (ctx.apiKey) {
    const hashed = createHash('sha256').update(ctx.apiKey).digest('hex')
    const key = await prisma.apiKey.findUnique({ where: { hashedKey: hashed } })
    if (!key || !key.enabled) {
      return { ok: false, code: 'unauthorized', status: 401, message: 'Invalid API key' }
    }
    const rl = await checkAndRecord({ subject: key.id, limit: cfg.RATE_LIMIT_MAX * key.tier, windowMs: cfg.RATE_LIMIT_WINDOW_MS })
    if (!rl.allowed) return { ok: false, code: 'rate_limit', status: 429, retryAfterMs: rl.retryAfterMs, message: 'Rate limit exceeded' }
    return { ok: true, subject: key.id, apiKeyId: key.id }
  }

  // Public path: captcha required.
  if (!ctx.captchaToken || !(await verifyTurnstile(cfg.TURNSTILE_SECRET_KEY, ctx.captchaToken, ctx.ip))) {
    return { ok: false, code: 'captcha', status: 403, message: 'Captcha verification failed' }
  }
  const subject = hashIp(ctx.ip)
  const rl = await checkAndRecord({ subject, limit: cfg.RATE_LIMIT_MAX, windowMs: cfg.RATE_LIMIT_WINDOW_MS })
  if (!rl.allowed) return { ok: false, code: 'rate_limit', status: 429, retryAfterMs: rl.retryAfterMs, message: 'Rate limit exceeded' }
  return { ok: true, subject }
}
