'use client'
import Script from 'next/script'
import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      remove: (widgetId: string) => void
    }
  }
}

/**
 * A Turnstile challenge that hands its token to `onToken` ('' when the token expires). Tokens are
 * single-use: remount the widget (change its `key`) after each claim to get a fresh one.
 */
export function TurnstileWidget({ siteKey, onToken }: { siteKey: string; onToken: (t: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let widgetId: string | undefined
    const tryRender = () => {
      if (widgetId !== undefined || !ref.current || !window.turnstile) return
      clearInterval(timer)
      widgetId = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        callback: (token: string) => onToken(token),
        'expired-callback': () => onToken(''),
      })
    }
    const timer = setInterval(tryRender, 300)
    tryRender()
    return () => {
      clearInterval(timer)
      if (widgetId !== undefined) window.turnstile?.remove(widgetId)
    }
  }, [siteKey, onToken])

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      <div
        ref={ref}
        className="flex min-h-[78px] items-center justify-center rounded-input border border-dashed border-input-border p-3 text-xs text-muted-foreground"
      />
    </>
  )
}
