import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BSV Teranode Testnet Faucet",
  description:
    "Grab spendable teratestnet satoshis in one click and start shipping against Teranode — the architecture that pushed BSV past 1,000,000 transactions per second.",
  openGraph: {
    title: "BSV Teranode Testnet Faucet",
    description:
      "Free test coins to build on the million-TPS network. One-click BRC-100 wallet claims, instantly spendable.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#070a14",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
