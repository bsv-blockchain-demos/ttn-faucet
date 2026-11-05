const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const TIMEOUT_MS = 10_000

/**
 * Cloudflare siteverify. Any failure (rejected token, HTTP error, timeout, network) is `false`.
 * `remoteIp` is sent as `remoteip` only when given. Pass `ClientIp.remoteIp`, which is set only
 * for an IP from CF-Connecting-IP: Cloudflare checks it against the IP that solved the
 * challenge, so a proxy's address in its place is worse than leaving it out.
 */
export async function verifyTurnstile(secret: string, token: string, remoteIp?: string): Promise<boolean> {
  const form = new URLSearchParams()
  form.append('secret', secret)
  form.append('response', token)
  if (remoteIp) form.append('remoteip', remoteIp)
  try {
    const resp = await fetch(SITEVERIFY, { method: 'POST', body: form, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!resp.ok) return false
    const data = (await resp.json()) as { success?: boolean }
    return data.success === true
  } catch {
    return false
  }
}
