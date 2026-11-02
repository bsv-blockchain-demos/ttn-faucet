'use client'
import { Moon, Sun } from '@phosphor-icons/react/dist/ssr'
import { useSyncExternalStore } from 'react'

type Theme = 'light' | 'dark'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/**
 * Runs before paint (injected in <head> by layout) to set the class with no flash. Like
 * bsvblockchain.org, the page follows the operating system until the reader picks a theme.
 */
export const themeNoFlashScript = `(function(){try{var t=localStorage.getItem('theme');if(t!=='dark'&&t!=='light'){t=matchMedia('${DARK_QUERY}').matches?'dark':'light';}document.documentElement.classList.toggle('dark',t==='dark');document.documentElement.style.colorScheme=t;}catch(e){}})();`

function apply(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
}

function storedTheme(): Theme | null {
  try {
    const t = localStorage.getItem('theme')
    return t === 'dark' || t === 'light' ? t : null
  } catch {
    return null
  }
}

// Tiny external store over the <html> class — the no-flash script is the initial writer.
// useSyncExternalStore keeps SSR ('light') and the post-hydration value in sync without a
// setState-in-effect or a hydration mismatch.
const listeners = new Set<() => void>()
function subscribe(cb: () => void) {
  listeners.add(cb)
  // While the reader hasn't picked a theme, keep following the system.
  const media = window.matchMedia(DARK_QUERY)
  const onSystem = () => {
    if (storedTheme()) return
    apply(media.matches ? 'dark' : 'light')
    listeners.forEach((l) => l())
  }
  media.addEventListener('change', onSystem)
  return () => {
    listeners.delete(cb)
    media.removeEventListener('change', onSystem)
  }
}
function getSnapshot(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}
function getServerSnapshot(): Theme {
  return 'light'
}

function toggleTheme() {
  const next: Theme = getSnapshot() === 'dark' ? 'light' : 'dark'
  apply(next)
  try {
    localStorage.setItem('theme', next)
  } catch {}
  listeners.forEach((l) => l())
}

const noop = () => () => {}

/** Provider is kept as a thin wrapper so layout composition reads clearly. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return { theme, toggle: toggleTheme }
}

/**
 * Light and dark, one icon-only button, as in the bsvblockchain.org header. The icon shows the theme
 * it will switch to, and nothing renders until hydration: the server can't know the resolved theme,
 * so the placeholder holds the button's size and the header never shifts.
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const mounted = useSyncExternalStore(noop, () => true, () => false)
  const dark = theme === 'dark'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={mounted ? (dark ? 'Switch to light mode' : 'Switch to dark mode') : 'Switch theme'}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {mounted ? (
        dark ? (
          <Sun aria-hidden weight="regular" className="size-4.5" />
        ) : (
          <Moon aria-hidden weight="regular" className="size-4.5" />
        )
      ) : (
        <span aria-hidden className="size-4.5" />
      )}
    </button>
  )
}
