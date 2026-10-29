'use client'
import { withBasePath } from '@/lib/base-path'
import { useEffect, useState } from 'react'
import type { NetworkId } from '@/lib/networks'

// undefined = loading, null = unavailable, number = live sats balance.
export type BalanceState = number | null | undefined

/** Polls /api/balance for `network` every 30s. Powers the live "Treasury balance" stat card. */
export function useFaucetBalanceSats(network: NetworkId): BalanceState {
  const [sats, setSats] = useState<BalanceState>(undefined)
  // Reset to "loading" when the network changes, rather than showing the last network's balance.
  const [loadedFor, setLoadedFor] = useState(network)
  if (loadedFor !== network) {
    setLoadedFor(network)
    setSats(undefined)
  }

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch(withBasePath(`/api/balance?network=${network}`))
        const json = await res.json()
        if (alive) setSats(typeof json.balanceSats === 'number' ? json.balanceSats : null)
      } catch {
        if (alive) setSats(null)
      }
    }
    load()
    const id = setInterval(load, 30_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [network])

  return sats
}
