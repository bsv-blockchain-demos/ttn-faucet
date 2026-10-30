import { ArrowUpRight } from '@phosphor-icons/react/dist/ssr'
import { BrandMark } from './BrandMark'

const GITHUB = 'https://github.com/bsv-blockchain-demos/ttn-faucet'

type FooterLink = { label: string; href: string; external?: boolean }

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: 'Faucet',
    links: [
      { label: 'Claim test coins', href: '#claim' },
      { label: 'Status', href: '#status' },
      { label: 'API', href: '#api' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Docs', href: `${GITHUB}#readme`, external: true },
      { label: 'GitHub', href: GITHUB, external: true },
      { label: 'BSV Blockchain', href: 'https://www.bsvblockchain.org', external: true },
    ],
  },
]

/** The bsvblockchain.org footer: surface band, wordmark and a line, link columns, then a legal row. */
export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="container-page py-14 md:py-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-20">
          <div>
            <BrandMark />
            <p className="body-md mt-4 max-w-xs text-ink-muted">
              <span className="block">Free test coins on every BSV test network.</span>
              <span className="block">For development and testing only.</span>
            </p>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {COLUMNS.map((column) => (
              <div key={column.title}>
                <p className="label-sm mb-4 text-ink-muted uppercase">{column.title}</p>
                <ul className="space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        {...(link.external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
                        className="inline-flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-foreground"
                      >
                        {link.label}
                        {link.external ? <ArrowUpRight aria-hidden className="size-3" /> : null}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-border pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-muted">© {new Date().getFullYear()} BSV Association. Test coins have no value.</p>
          <a
            href="https://github.com/bsv-blockchain/wallet-toolbox"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-foreground"
          >
            Built on @bsv/wallet-toolbox
            <ArrowUpRight aria-hidden className="size-3" />
          </a>
        </div>
      </div>
    </footer>
  )
}
