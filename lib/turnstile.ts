const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const TIMEOUT_MS = 10_000

/** Cloudflare siteverify. Any failure (rejected token, HTTP error, timeout, network) is `false`. */
export async function verifyTurnstile(secret: string, token: string, ip?: string): Promise<boolean> {
  const form = new URLSearchParams()
  form.append('secret', secret)
  form.append('response', token)
  if (ip) form.append('remoteip', ip)
  try {
    const resp = await fetch(SITEVERIFY, { method: 'POST', body: form, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!resp.ok) return false
    const data = (await resp.json()) as { success?: boolean }
    return data.success === true
  } catch {
    return false
  }
}
