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
  title: 'BSV Teranode Testnet Faucet',
  description:
    'Request spendable Teratestnet coins in a single click and start shipping against Teranode, the architecture that pushed BSV past one million transactions per second.',
  openGraph: {
    title: 'BSV Teranode Testnet Faucet',
    description:
      'Build on the network that broke a million TPS. One-click BRC-100 wallet claims, instantly spendable.',
    type: 'website',
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
