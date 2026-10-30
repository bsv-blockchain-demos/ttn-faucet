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
}

/** Cloudflare's test site key: the widget always passes. */
export const DEFAULT_TURNSTILE_SITE_KEY = '1x00000000000000000000AA'

/**
 * The deprecated NEXT_PUBLIC_* values as `next build` inlined them. Next replaces these literal
 * `process.env.NEXT_PUBLIC_*` reads at build time, so images built with them keep working.
 */
const BUILD_TIME: Partial<PublicConfig> = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
}

const first = (...values: Array<string | undefined>) => values.map((v) => v?.trim()).find(Boolean)

const isHttpUrl = (v: string | undefined) => {
  if (!v) return false
  try {
    return ['http:', 'https:'].includes(new URL(v).protocol)
  } catch {
    return false
  }
}

/**
 * Runtime `SITE_URL` / `TURNSTILE_SITE_KEY` first, then the deprecated NEXT_PUBLIC_* names set at
 * runtime, then those names as inlined at build time, then the defaults. Pure, for tests: pass
 * `process.env`. A site URL that is not an absolute http(s) URL is skipped.
 */
export function resolvePublicConfig(
  env: Record<string, string | undefined>,
  build: Partial<PublicConfig> = BUILD_TIME,
): PublicConfig {
  const urls = [env.SITE_URL, env.NEXT_PUBLIC_SITE_URL, build.siteUrl].map((v) => v?.trim())
  return {
    siteUrl: (urls.find(isHttpUrl) ?? DEFAULT_SITE_URL).replace(/\/+$/, ''),
    turnstileSiteKey:
      first(env.TURNSTILE_SITE_KEY, env.NEXT_PUBLIC_TURNSTILE_SITE_KEY, build.turnstileSiteKey) ??
      DEFAULT_TURNSTILE_SITE_KEY,
  }
}
