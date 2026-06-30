'use client'
import { useSyncExternalStore } from 'react'

type Theme = 'light' | 'dark'

/** Runs before paint (injected in <head> by layout) to set the class with no flash. */
export const themeNoFlashScript = `(function(){try{var t=localStorage.getItem('theme');if(t!=='dark'&&t!=='light'){t='light';}document.documentElement.classList.toggle('dark',t==='dark');}catch(e){}})();`

// Tiny external store over the <html> class — the no-flash script is the initial writer.
// useSyncExternalStore keeps SSR ('light') and the post-hydration value in sync without a
// setState-in-effect or a hydration mismatch.
const listeners = new Set<() => void>()
function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
function getSnapshot(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}
function getServerSnapshot(): Theme {
  return 'light'
}

function toggleTheme() {
  const next: Theme = document.documentElement.classList.contains('dark') ? 'light' : 'dark'
  document.documentElement.classList.toggle('dark', next === 'dark')
  try {
    localStorage.setItem('theme', next)
  } catch {}
  listeners.forEach((l) => l())
}

/** Provider is kept as a thin wrapper so layout composition reads clearly. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return { theme, toggle: toggleTheme }
}

/** Header theme toggle — a 40px circle, sun/moon glyph that flips with theme. */
export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle light / dark theme"
      title="Toggle theme"
      className="flex h-10 w-10 items-center justify-center rounded-full border border-hairline bg-card text-foreground transition hover:bg-band"
    >
      {theme === 'dark' ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" />
        </svg>
      )}
    </button>
  )
}
