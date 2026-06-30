'use client'
import Script from 'next/script'
import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string }
  }
}

export function TurnstileWidget({ siteKey, onToken }: { siteKey: string; onToken: (t: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const rendered = useRef(false)

  useEffect(() => {
    const tryRender = () => {
      if (rendered.current || !ref.current || !window.turnstile) return
      rendered.current = true
      window.turnstile.render(ref.current, {
        sitekey: siteKey,
        callback: (token: string) => onToken(token),
      })
    }
    tryRender()
    const id = setInterval(tryRender, 300)
    return () => clearInterval(id)
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
