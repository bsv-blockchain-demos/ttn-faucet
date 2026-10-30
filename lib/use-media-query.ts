'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * Tracks a media query (from Beersy's hooks/use-media-query.ts). The server snapshot is `false`:
 * there is no viewport while rendering, and callers make the `false` branch the safe one.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onStoreChange)
      return () => list.removeEventListener('change', onStoreChange)
    },
    [query]
  )
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

/** `md` and up with a fine pointer: a hover-anchored popover is wrong on touch, even on a tablet. */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 768px) and (pointer: fine)')
}
