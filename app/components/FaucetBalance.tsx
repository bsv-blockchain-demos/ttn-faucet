'use client'
import { useEffect, useState } from 'react'

// undefined = loading, null = unavailable, number = live sats balance.
export type BalanceState = number | null | undefined

/** Polls /api/balance every 30s. Powers the live "Treasury balance" stat card. */
export function useFaucetBalanceSats(): BalanceState {
  const [sats, setSats] = useState<BalanceState>(undefined)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch('/api/balance')
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
  }, [])

  return sats
}
