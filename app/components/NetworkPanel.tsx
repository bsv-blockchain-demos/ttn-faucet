'use client'
import { useNetwork } from './NetworkProvider'

/** A container that wears the selected network: sets data-network so .on-net / bg-net resolve. */
export function NetworkPanel({ className = '', children }: { className?: string; children: React.ReactNode }) {
  const { network } = useNetwork()
  return (
    <div data-network={network} className={className}>
      {children}
    </div>
  )
}
