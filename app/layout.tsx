import type { Metadata, Viewport } from 'next'
import { Noto_Sans, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { ThemeProvider, themeNoFlashScript } from './components/ThemeProvider'

const notoSans = Noto_Sans({
  variable: '--font-noto-sans',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  display: 'swap',
})

const jetBrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
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
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#1e1f24' },
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
      className={`${notoSans.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <head>
        {/* Chillax (display) — not on Google Fonts; loaded from Fontshare. */}
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=chillax@400,500,600&display=swap"
        />
        {/* Set the theme class before paint to avoid a flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeNoFlashScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
