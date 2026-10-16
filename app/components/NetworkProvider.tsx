'use client'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { DEFAULT_NETWORK, isNetworkId, NETWORK_IDS, type NetworkId } from '@/lib/networks'

/**
 * The network the visitor is claiming on. Wallets can't tell us which test network they're on
 * (BRC-100 getNetwork only says 'testnet'), so the visitor picks one; the pick is remembered in
 * localStorage so a returning visitor lands on the same network.
 */
interface NetworkState {
  network: NetworkId
  setNetwork: (n: NetworkId) => void
  /** Networks this faucet pays out on; undefined until /api/networks answers. */
  available: NetworkId[] | undefined
}

const NetworkContext = createContext<NetworkState | null>(null)

const STORAGE_KEY = 'faucet.network'

// Storage can be missing or throw (private mode, blocked site data); the pick then just isn't remembered.
function loadStored(): NetworkId | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return isNetworkId(v) ? v : null
  } catch {
    return null
  }
}

function store(n: NetworkId) {
  try {
    localStorage.setItem(STORAGE_KEY, n)
  } catch {}
}

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [network, setNetworkState] = useState<NetworkId>(DEFAULT_NETWORK)
  const [available, setAvailable] = useState<NetworkId[] | undefined>(undefined)

  // Restore the last pick, then settle on a network this faucet actually serves.
  useEffect(() => {
    let alive = true
    const stored = loadStored()
    ;(async () => {
      if (stored) setNetworkState(stored)
      const res = await fetch('/api/networks').catch(() => null)
      const json = await res?.json().catch(() => null)
      if (!alive) return
      const served: NetworkId[] = Array.isArray(json?.networks) ? json.networks.filter(isNetworkId) : [...NETWORK_IDS]
      setAvailable(served)
      const fallback = isNetworkId(json?.default) ? json.default : served[0] ?? DEFAULT_NETWORK
      setNetworkState((cur) => (served.includes(cur) ? cur : fallback))
    })()
    return () => {
      alive = false
    }
  }, [])

  const setNetwork = useCallback((n: NetworkId) => {
    setNetworkState(n)
    store(n)
  }, [])

  return <NetworkContext.Provider value={{ network, setNetwork, available }}>{children}</NetworkContext.Provider>
}

export function useNetwork(): NetworkState {
  const ctx = useContext(NetworkContext)
  if (!ctx) throw new Error('useNetwork must be used inside <NetworkProvider>')
  return ctx
}
