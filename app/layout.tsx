import type { Metadata, Viewport } from 'next'
import './globals.css'
import { siteUrl } from '@/lib/base-path'
import { ThemeProvider, themeNoFlashScript } from './components/ThemeProvider'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
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
      className="h-full antialiased"
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
