/**
 * Tell the faucet a phone just connected, so it can run the claim while the wallet app is still
 * on screen. Best effort with a few quick retries; the faucet also polls as a backstop. The call
 * carries no authority: the faucet only acts if this relay reports the session connected.
 */
export async function notifyConnected(
  faucetUrl: string,
  sessionId: string,
  { attempts = 3, baseDelayMs = 250, timeoutMs = 3000, fetchImpl = fetch } = {},
): Promise<boolean> {
  const url = `${faucetUrl.replace(/\/$/, '')}/api/claim/mobile/${encodeURIComponent(sessionId)}`
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetchImpl(url, { method: 'POST', signal: AbortSignal.timeout(timeoutMs) })
      if (res.ok) return true
    } catch {
      // retry
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** i))
  }
  return false
}
