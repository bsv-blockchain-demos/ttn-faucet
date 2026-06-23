'use client'
import { useEffect, useState } from 'react'

function fmt(sats: number): string {
  const tbsv = (sats / 1e8).toLocaleString(undefined, { maximumFractionDigits: 8 })
  return `${sats.toLocaleString()} sats (${tbsv} tBSV)`
}

// undefined = loading, null = unavailable
export function FaucetBalance() {
  const [sats, setSats] = useState<number | null | undefined>(undefined)

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

  return (
    <p className="text-sm text-gray-600">
      Faucet balance:{' '}
      <span className="font-medium text-gray-900">
        {sats === undefined ? '…' : sats === null ? 'unavailable' : fmt(sats)}
      </span>
    </p>
  )
}
