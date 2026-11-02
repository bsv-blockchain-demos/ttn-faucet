'use client'

import { useState } from 'react'
import { Drawer as Vaul } from 'vaul'
import { ArrowUpRight, Info } from '@phosphor-icons/react/dist/ssr'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { useIsDesktop } from '@/lib/use-media-query'
import { BEERSY, type Term } from '@/lib/glossary'
import { cn } from '@/lib/utils'

/**
 * An inline glossary term, as Beersy renders them (components/glossary/term-pill.tsx): a chip with
 * the word and an info icon that opens the definition. A popover anchored to the word on desktop;
 * a bottom sheet on touch, with no dimming overlay, because the sentence the reader was in should
 * stay readable behind it.
 *
 * It is a `span` with a button role rather than a `<button>`: only `display: inline` keeps a chip in
 * running text from growing its line, and Chrome won't make a `<button>` inline. The role, tabindex
 * and key handling put back what the element gives up.
 */
export function TermPill({
  term,
  className,
  children,
}: {
  term: Term
  /** Extra classes for the chip, e.g. a text colour that has to survive (the network name). */
  className?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const isDesktop = useIsDesktop()
  const toggle = () => setOpen((previous) => !previous)

  const trigger = (
    <span
      role="button"
      tabIndex={0}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        toggle()
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        event.stopPropagation()
        toggle()
      }}
      aria-expanded={open}
      aria-label={`What ${term.term} means`}
      className={cn(
        // Keeps the word and its icon together across a line break.
        'inline whitespace-nowrap',
        // Semi-rounded, not a pill: these are words in a sentence, not tags.
        'rounded-[0.3em] border border-border/70 bg-secondary/40 px-[0.28em] py-[0.06em] transition-colors hover:border-border hover:bg-secondary',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        'cursor-pointer font-medium text-foreground no-underline',
        open && 'border-border bg-secondary',
        className
      )}
    >
      {children}
      {/* In em, so the icon tracks the surrounding type; nudged to the text's optical centre. */}
      <Info aria-hidden className="ml-[0.22em] inline size-[0.85em] align-[-0.12em] text-ink-muted" />
    </span>
  )

  const body = (
    <>
      <p className="text-[0.9375rem] leading-relaxed text-pretty">{term.definition}</p>

      {term.aliases && term.aliases.length > 0 && (
        <p className="mt-2 text-xs text-ink-muted">Also called {term.aliases.join(', ')}</p>
      )}

      {term.brcNumbers.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-ink-muted">Defined in</span>
          {term.brcNumbers.slice(0, 4).map((number) => (
            <a
              key={number}
              href={`${BEERSY}/brc/${number}`}
              target="_blank"
              rel="noreferrer noopener"
              className="tnum rounded-md border border-border px-1.5 py-0.5 text-xs font-medium no-underline hover:bg-secondary"
            >
              BRC-{number}
            </a>
          ))}
        </div>
      )}

      {term.more && (
        <a
          href={term.more.href}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary no-underline hover:underline"
        >
          {term.more.label}
          <ArrowUpRight className="size-3" />
        </a>
      )}
    </>
  )

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} collisionPadding={16} className="w-80 max-w-[calc(100vw-2rem)] p-4">
          <h3 className="mb-1.5 font-display text-base font-semibold tracking-tight">{term.term}</h3>
          {body}
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <Vaul.Root open={open} onOpenChange={setOpen} modal={false}>
      <Vaul.Trigger asChild>{trigger}</Vaul.Trigger>
      <Vaul.Portal>
        {/* No overlay: nothing dims, the page stays live, and the sheet closes on a swipe down,
            Escape, or the chip that opened it. */}
        <Vaul.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-xl border-t border-border bg-popover pb-[env(safe-area-inset-bottom)] text-popover-foreground shadow-[0_-8px_30px_rgb(0_0_0/0.12)]"
        >
          <div aria-hidden className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-muted" />
          <div className="p-4 pt-3">
            <Vaul.Title className="mb-1.5 font-display text-base font-semibold tracking-tight">{term.term}</Vaul.Title>
            {body}
          </div>
        </Vaul.Content>
      </Vaul.Portal>
    </Vaul.Root>
  )
}
