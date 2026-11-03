import { cache } from 'react'
import { connection } from 'next/server'
import { DEFAULT_SITE_URL } from './base-path'

/**
 * Settings the page shows to the browser that differ between deployments of the same image. They
 * are read from the server's environment per request and passed to client components as props, so
 * one build serves any public URL and Turnstile key. Callers render dynamically (`connection()`),
 * or the value read at build time would be frozen into the prerendered page.
 */
export interface PublicConfig {
  /** Public address of the faucet, base path included, with no trailing slash. */
  siteUrl: string
  turnstileSiteKey: string
  /** TURNSTILE_REQUIRED=true: the claim forms show the widget and send its token. */
  turnstileRequired: boolean
}

/** Cloudflare's test site key: the widget always passes. */
export const DEFAULT_TURNSTILE_SITE_KEY = '1x00000000000000000000AA'

/** Build-time values, as `next build` inlined them. */
export interface BuildTimeConfig {
  turnstileSiteKey?: string
}

/**
 * The deprecated NEXT_PUBLIC_TURNSTILE_SITE_KEY as `next build` inlined it (the Docker build arg).
 * Next replaces this literal `process.env.NEXT_PUBLIC_*` read at build time. There is no site URL
 * counterpart: no image is built with NEXT_PUBLIC_SITE_URL, so it is only read at runtime.
 */
const BUILD_TIME: BuildTimeConfig = {
  turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
}

const first = (...values: Array<string | undefined>) => values.map((v) => v?.trim()).find(Boolean)

const isHttpUrl = (v: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(v).protocol)
  } catch {
    return false
  }
}

const SITE_URL_VARS = ['SITE_URL', 'NEXT_PUBLIC_SITE_URL'] as const

/** `VAR=value` pairs already warned about: the page resolves the config on every request. */
const warned = new Set<string>()

/** Test-only: forget which rejected values were already logged. */
export function resetSiteUrlWarnings(): void {
  warned.clear()
}

/** The first site URL var that holds an absolute http(s) URL. A set but rejected value is logged once. */
function resolveSiteUrl(env: Record<string, string | undefined>): string {
  for (const name of SITE_URL_VARS) {
    const raw = env[name]
    if (raw === undefined) continue
    const value = raw.trim()
    if (value && isHttpUrl(value)) return value.replace(/\/+$/, '')
    const key = `${name}=${raw}`
    if (!warned.has(key)) {
      warned.add(key)
      console.warn(`Ignoring ${name}=${JSON.stringify(raw)}: not an absolute http(s) URL. Falling back.`)
    }
  }
  return DEFAULT_SITE_URL
}

/**
 * Runtime `SITE_URL` / `TURNSTILE_SITE_KEY` first, then the deprecated NEXT_PUBLIC_* names set at
 * runtime, then (site key only) the deprecated name as inlined at build time, then the defaults.
 * For tests: pass `process.env`. A site URL that is not an absolute http(s) URL is skipped, with a
 * warning (its only side effect).
 */
export function resolvePublicConfig(
  env: Record<string, string | undefined>,
  build: BuildTimeConfig = BUILD_TIME,
): PublicConfig {
  return {
    siteUrl: resolveSiteUrl(env),
    turnstileSiteKey:
      first(env.TURNSTILE_SITE_KEY, env.NEXT_PUBLIC_TURNSTILE_SITE_KEY, build.turnstileSiteKey) ??
      DEFAULT_TURNSTILE_SITE_KEY,
    turnstileRequired: env.TURNSTILE_REQUIRED?.trim() === 'true',
  }
}

/**
 * The public config for this request. Waits for the request first (`connection()`), so the page
 * renders per request instead of freezing the build's env; cached for the rest of the render.
 */
export const getPublicConfig = cache(async (): Promise<PublicConfig> => {
  await connection()
  return resolvePublicConfig(process.env)
})
