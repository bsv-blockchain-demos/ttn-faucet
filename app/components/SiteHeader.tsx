'use client'
import { useEffect, useState } from 'react'
import { BrandMark } from './BrandMark'
import { ThemeToggle } from './ThemeProvider'
import { BTN_PRIMARY } from './buttons'

const NAV = [
  { label: 'Status', href: '#status' },
  { label: 'API', href: '#api' },
  { label: 'Docs', href: 'https://github.com/bsv-blockchain-demos/ttn-faucet#readme', external: true },
  { label: 'GitHub', href: 'https://github.com/bsv-blockchain-demos/ttn-faucet', external: true },
]

/**
 * The bsvblockchain.org header: sticky, transparent over the hero until the page scrolls, then a
 * hairline and a blurred page-colour backing. Wordmark left; links, theme switch and the one call
 * to action right.
 */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-colors duration-200 ${
        scrolled ? 'border-border bg-background/92 backdrop-blur-md' : 'border-transparent'
      }`}
    >
      <div className="container-page flex h-16 items-center gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark className="h-auto w-full max-w-40 min-[480px]:h-[0.9375rem] min-[480px]:w-auto min-[480px]:max-w-none" />
          <span className="h-5 w-px flex-none bg-border" aria-hidden />
          <span className="font-display text-[1.0625rem] font-semibold tracking-[-0.02em]">Faucet</span>
        </div>

        <nav aria-label="Main" className="ms-auto hidden items-center gap-0.5 md:flex">
          {NAV.map((item) => (
            <a
              key={item.label}
              href={item.href}
              {...(item.external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
              className="rounded-md px-2.5 py-2 text-sm font-medium whitespace-nowrap text-ink-muted transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-2 md:ms-0">
          <ThemeToggle />
          <a href="#claim" data-glow="" className={`${BTN_PRIMARY} hidden h-9 px-3.5 text-[0.8125rem] sm:inline-flex`}>
            Claim test coins
          </a>
        </div>
      </div>
    </header>
  )
}
