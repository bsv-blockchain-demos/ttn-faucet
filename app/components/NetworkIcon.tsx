import { Cube, Flask, Gauge } from '@phosphor-icons/react/dist/ssr'
import type { Icon } from '@phosphor-icons/react'
import type { NetworkId } from '@/lib/networks'

/**
 * One glyph per test network, so the networks differ by shape as well as colour:
 * Testnet is the lab (a flask), Teratestnet is Teranode's blocks (a cube), and Teranode STN is
 * the scaling test (a gauge). Colour comes from the caller (text-net, or white on a filled chip).
 */
const ICONS: Record<NetworkId, Icon> = { testnet: Flask, ttn: Cube, tstn: Gauge }

export function NetworkIcon({ network, className = 'size-4' }: { network: NetworkId; className?: string }) {
  const Glyph = ICONS[network]
  return <Glyph aria-hidden weight="duotone" className={`flex-none ${className}`} />
}
