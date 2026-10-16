import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import { ThemeProvider, themeNoFlashScript } from './components/ThemeProvider'

// Rysana Type (rysana.com/type, SIL OFL 1.1 — see app/fonts/rysana/OFL.txt): Sans for text and
// display, Mono for labels, readouts and code. Vendored from rysana-type@1.0.1 (the Latin "Core"
// variable subsets, 100–900 upright + italic) rather than installed, so no package can change
// underneath the build.
// next/font needs literal options, so the Latin unicode-range is repeated in each loader.

const rysanaSans = localFont({
  src: [
    { path: './fonts/rysana/RysanaSans-Variable-Core.woff2', style: 'normal' },
    { path: './fonts/rysana/RysanaSans-VariableItalic-Core.woff2', style: 'italic' },
  ],
  weight: '100 900',
  variable: '--font-rysana-sans',
  display: 'swap',
  declarations: [{ prop: 'unicode-range', value: 'U+0-36F,U+1E00-1EFF,U+2000-206F,U+20A0-20CF,U+2100-215F,U+2190-21FF,U+2212,U+FEFF,U+FFFD' }],
  fallback: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
})

const rysanaMono = localFont({
  src: [
    { path: './fonts/rysana/RysanaMono-Variable-Core.woff2', style: 'normal' },
    { path: './fonts/rysana/RysanaMono-VariableItalic-Core.woff2', style: 'italic' },
  ],
  weight: '100 900',
  variable: '--font-rysana-mono',
  display: 'swap',
  declarations: [{ prop: 'unicode-range', value: 'U+0-36F,U+1E00-1EFF,U+2000-206F,U+20A0-20CF,U+2100-215F,U+2190-21FF,U+2212,U+FEFF,U+FFFD' }],
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://faucet-ttn.bsvblockchain.tech'),
  title: 'BSV Faucet: free test coins',
  description:
    'A BSV Blockchain faucet for every test network. Pick your network and grab free, spendable test coins in one click with a BRC-100 wallet, or POST an address via the dev API.',
  applicationName: 'BSV Faucet',
  openGraph: {
    type: 'website',
    siteName: 'BSV Blockchain',
    title: 'BSV Faucet: free test coins',
    description:
      'Free, spendable test coins in one click on any BSV test network. Connect a BRC-100 wallet or POST an address.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BSV Faucet: free test coins',
    description: 'Free, spendable test coins in one click on any BSV test network.',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f4f1' },
    { media: '(prefers-color-scheme: dark)', color: '#0e0e0f' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${rysanaSans.variable} ${rysanaMono.variable} h-full antialiased`}
    >
      <head>
        {/* Set the theme class before paint to avoid a flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeNoFlashScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
