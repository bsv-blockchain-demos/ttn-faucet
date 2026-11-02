/**
 * Button classes from bsvblockchain.org (components/ui/button.tsx): 44px tall, 10px radius, labels
 * never wrap, a 1px lift on hover and a press on active. Pair with `data-glow` for the pointer
 * highlight. Primary is the layered brand-blue surface; secondary is paper with a hairline.
 */
const BASE =
  'inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md px-5 text-sm font-medium outline-none transition-[transform,background-color,border-color,color] duration-150 hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0'

export const BTN_PRIMARY = `${BASE} btn-surface btn-primary-surface text-primary-foreground`
export const BTN_SECONDARY = `${BASE} btn-surface btn-secondary-surface border border-border text-foreground`
export const BTN_GHOST = `${BASE} bg-transparent text-ink-muted hover:bg-secondary hover:text-foreground`

/** The claim button: the primary surface at full width and 56px, two-line label left, arrow right. */
export const BTN_CLAIM =
  'group btn-surface btn-primary-surface flex min-h-14 w-full items-center gap-3 rounded-md px-5 text-left text-primary-foreground outline-none transition-[transform,filter] duration-150 hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50'

/**
 * Segmented control: one inset track holding every option, so a row of choices reads as a single
 * group rather than separate buttons. The active segment wears the primary button surface (the
 * header's "Claim test coins"); the rest sit flat in the track until hovered.
 */
export const SEGMENT_TRACK = 'rounded-lg border border-border bg-surface p-1'

export function segmentCls(active: boolean, extra = '') {
  return `flex min-h-10 w-full min-w-0 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium leading-tight outline-none transition-[color,background-color,filter,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface disabled:pointer-events-none ${
    active
      ? 'btn-surface btn-primary-surface text-primary-foreground'
      : 'text-ink-muted hover:bg-surface-raised hover:text-foreground'
  } ${extra}`
}
