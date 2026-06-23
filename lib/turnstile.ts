const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export async function verifyTurnstile(secret: string, token: string, ip?: string): Promise<boolean> {
  const form = new URLSearchParams()
  form.append('secret', secret)
  form.append('response', token)
  if (ip) form.append('remoteip', ip)
  const resp = await fetch(SITEVERIFY, { method: 'POST', body: form })
  if (!resp.ok) return false
  const data = (await resp.json()) as { success?: boolean }
  return data.success === true
}
