import type { Metadata, Viewport } from 'next'
import { connection } from 'next/server'
import { Agentation } from 'agentation'
import { Geist, Geist_Mono } from 'next/font/google'
import localFont from 'next/font/local'
import './globals.css'
import { resolvePublicConfig } from '@/lib/public-config'
import { ThemeProvider, themeNoFlashScript } from './components/ThemeProvider'
import { PointerGlow } from './components/PointerGlow'

// The bsvblockchain.org faces: Geist for body, Geist Mono for code, Chillax for display.
const geistSans = Geist({ variable: '--font-body', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-mono-face', subsets: ['latin'] })
/** Chillax (variable, 200–700) — the display face shared with bsvblockchain.org and bsvassociation.org. */
const chillax = localFont({
  src: './fonts/Chillax-Variable.woff2',
  variable: '--font-display-face',
  weight: '200 700',
  display: 'swap',
})

/** Per request, so each deployment's og:image and other absolute URLs point at its own SITE_URL. */
export async function generateMetadata(): Promise<Metadata> {
  await connection()
  return { metadataBase: new URL(resolvePublicConfig(process.env).siteUrl), ...metadata }
}

const metadata: Metadata = {
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
    { media: '(prefers-color-scheme: light)', color: '#F4F2F0' },
    { media: '(prefers-color-scheme: dark)', color: '#0F1230' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
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
      className={`${geistSans.variable} ${geistMono.variable} ${chillax.variable}`}
      data-scroll-behavior="smooth"
    >
      <head>
        {/* Set the theme class before paint to avoid a flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeNoFlashScript }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-60 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <ThemeProvider>{children}</ThemeProvider>
        <PointerGlow />
        {process.env.NODE_ENV === 'development' && <Agentation />}
      </body>
    </html>
  )
}
