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
  /** The caller already verified a Turnstile token for this claim (mobile claims do, when the claim starts). */
  captchaVerified?: boolean
  apiKey?: string
}
export type GuardResult =
  | { ok: true; subject: string; apiKeyId?: string }
  | { ok: false; code: 'captcha' | 'rate_limit' | 'unauthorized'; status: number; retryAfterMs?: number; message: string }

const CAPTCHA_FAILED = { ok: false, code: 'captcha', status: 403, message: 'Captcha verification failed' } as const

/**
 * The Turnstile check for a public claim: null when it passes or TURNSTILE_REQUIRED is off, else
 * the 403 to return. Only meaningful without an API key; API-key callers never need a token.
 */
export async function checkCaptcha(token: string | undefined, ip: string): Promise<GuardResult | null> {
  const cfg = getConfig()
  if (!cfg.TURNSTILE_REQUIRED) return null
  // The config refuses TURNSTILE_REQUIRED without a secret, so the fallback never verifies anything.
  if (!token || !(await verifyTurnstile(cfg.TURNSTILE_SECRET_KEY ?? '', token, ip))) return CAPTCHA_FAILED
  return null
}

/**
 * Order: if a valid API key is presented, skip captcha and apply a higher limit. Otherwise require
 * a passing Turnstile token when TURNSTILE_REQUIRED is on, then apply the per-IP rate limit.
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
    if (!cfg.RATE_LIMIT_DISABLED) {
      const rl = await checkAndRecord({ subject: key.id, limit: cfg.RATE_LIMIT_MAX * key.tier, windowMs: cfg.RATE_LIMIT_WINDOW_MS })
      if (!rl.allowed) return { ok: false, code: 'rate_limit', status: 429, retryAfterMs: rl.retryAfterMs, message: 'Rate limit exceeded' }
    }
    return { ok: true, subject: key.id, apiKeyId: key.id }
  }

  if (!ctx.captchaVerified) {
    const failed = await checkCaptcha(ctx.captchaToken, ctx.ip)
    if (failed) return failed
  }
  const subject = hashIp(ctx.ip)
  if (!cfg.RATE_LIMIT_DISABLED) {
    const rl = await checkAndRecord({ subject, limit: cfg.RATE_LIMIT_MAX, windowMs: cfg.RATE_LIMIT_WINDOW_MS })
    if (!rl.allowed) return { ok: false, code: 'rate_limit', status: 429, retryAfterMs: rl.retryAfterMs, message: 'Rate limit exceeded' }
  }
  return { ok: true, subject }
}
