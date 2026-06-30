/** Thin-line icons (Lucide weight), currentColor-driven so they inherit tokens.
 *  Paths match the design reference. Decorative ones are aria-hidden by default. */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Base({ size = 18, strokeWidth = 1.7, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  )
}

export const BoltIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
  </Base>
)

export const TargetIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 2v20M2 12h20" />
    <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
  </Base>
)

export const RefreshIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" />
  </Base>
)

export const CheckIcon = (p: IconProps) => (
  <Base strokeWidth={3} {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Base>
)

export const ArrowRightIcon = (p: IconProps) => (
  <Base strokeWidth={2} {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Base>
)

export const WarningIcon = (p: IconProps) => (
  <Base strokeWidth={1.8} {...p}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </Base>
)

export const CopyIcon = (p: IconProps) => (
  <Base strokeWidth={1.8} {...p}>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Base>
)

export const ExternalIcon = (p: IconProps) => (
  <Base strokeWidth={1.8} {...p}>
    <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </Base>
)

export const CloseIcon = (p: IconProps) => (
  <Base strokeWidth={1.8} {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Base>
)

export const MonitorIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </Base>
)

export const PhoneIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="5" y="2" width="14" height="20" rx="2" />
    <path d="M12 18h.01" />
  </Base>
)
