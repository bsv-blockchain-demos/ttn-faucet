/** Phosphor icons (regular weight), the set bsvblockchain.org uses. currentColor-driven so they
 *  inherit tokens; decorative, so aria-hidden. Wrapped to keep the faucet's `size` prop API. */
import {
  ArrowRight,
  ArrowSquareOut,
  ArrowsClockwise,
  Check,
  Copy,
  CrosshairSimple,
  DeviceMobile,
  Lightning,
  Monitor,
  Warning,
  X,
} from '@phosphor-icons/react/dist/ssr'
import type { IconProps as PhosphorProps } from '@phosphor-icons/react'

type IconProps = Omit<PhosphorProps, 'size'> & { size?: number }

const wrap = (Icon: React.ComponentType<PhosphorProps>) => {
  function Wrapped({ size = 18, ...rest }: IconProps) {
    return <Icon size={size} aria-hidden {...rest} />
  }
  return Wrapped
}

export const BoltIcon = wrap(Lightning)
export const TargetIcon = wrap(CrosshairSimple)
export const RefreshIcon = wrap(ArrowsClockwise)
export const CheckIcon = wrap(Check)
export const ArrowRightIcon = wrap(ArrowRight)
export const WarningIcon = wrap(Warning)
export const CopyIcon = wrap(Copy)
export const ExternalIcon = wrap(ArrowSquareOut)
export const CloseIcon = wrap(X)
export const MonitorIcon = wrap(Monitor)
export const PhoneIcon = wrap(DeviceMobile)
