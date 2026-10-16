/**
 * The one-line BSV Blockchain wordmark in one colour: the white PNG is used as a mask over
 * currentColor, so the logo takes the text colour of whatever panel it sits on. Size it with a
 * height class; width follows the artwork's aspect ratio.
 */
export function BrandMark({ className = 'h-4' }: { className?: string }) {
  const mask = 'url(/brand/bsv-wordmark-white.png) center / contain no-repeat'
  return (
    <span
      role="img"
      aria-label="BSV Blockchain"
      className={`inline-block flex-none bg-current ${className}`}
      style={{ aspectRatio: '4255 / 297', mask, WebkitMask: mask }}
    />
  )
}
