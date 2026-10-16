/**
 * The BSV Blockchain stacked lockup in one colour: the white PNG is used as a mask over
 * currentColor, so the logo takes the text colour of whatever panel it sits on.
 */
export function BrandMark({ height = 24, className = '' }: { height?: number; className?: string }) {
  // Source is 2173 x 677.
  const width = Math.round((height * 2173) / 677)
  const mask = 'url(/brand/bsv-stacked-white.png) center / contain no-repeat'
  return (
    <span
      role="img"
      aria-label="BSV Blockchain"
      className={`inline-block flex-none bg-current ${className}`}
      style={{ width, height, mask, WebkitMask: mask }}
    />
  )
}
