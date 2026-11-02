'use client'
import { useEffect } from 'react'

/**
 * Tracks the pointer across anything marked `data-glow` and writes its position into
 * `--pointer-x` / `--pointer-y`, which the button and card surfaces read for their highlight (see
 * .btn-surface / .card-surface in globals.css). One delegated listener for the whole document,
 * coalesced into one animation frame; off under reduced motion. From bsvblockchain.org.
 */
export function PointerGlow() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0
    let pending: { target: HTMLElement; x: number; y: number } | null = null

    const flush = () => {
      frame = 0
      if (!pending) return
      const { target, x, y } = pending
      target.style.setProperty('--pointer-x', `${x}px`)
      target.style.setProperty('--pointer-y', `${y}px`)
      pending = null
    }

    const onPointer = (event: PointerEvent) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-glow]')
      if (!target) return
      const rect = target.getBoundingClientRect()
      pending = { target, x: event.clientX - rect.left, y: event.clientY - rect.top }
      if (!frame) frame = requestAnimationFrame(flush)
    }

    // Leaving returns the highlight to centre, so the next approach doesn't start where the pointer left.
    const onLeave = (event: PointerEvent) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-glow]')
      if (!target) return
      target.style.removeProperty('--pointer-x')
      target.style.removeProperty('--pointer-y')
    }

    document.addEventListener('pointermove', onPointer, { passive: true })
    document.addEventListener('pointerdown', onPointer, { passive: true })
    document.addEventListener('pointerout', onLeave, { passive: true })
    return () => {
      if (frame) cancelAnimationFrame(frame)
      document.removeEventListener('pointermove', onPointer)
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('pointerout', onLeave)
    }
  }, [])

  return null
}
