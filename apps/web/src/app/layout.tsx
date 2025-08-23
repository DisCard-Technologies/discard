import React from 'react'
import './globals.css';
import type { Metadata } from 'next';
import { DM_Sans, DM_Mono } from 'next/font/google';
import { Providers } from '../lib/providers';
import { Analytics } from "@vercel/analytics/next"

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
  weight: ["400", "500", "600", "700"],
})

const dmMono = DM_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-mono",
  weight: ["400", "500"],
})

export const metadata: Metadata = {
  title: 'DisCard - Privacy-first Crypto-backed Disposable Virtual Cards',
  description: 'Secure, disposable virtual cards backed by cryptocurrency',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${dmSans.variable} ${dmMono.variable}`}>
      <body className="antialiased">
        <Providers>
            {children}
        </Providers>
        <Analytics />
      </body>
    </html>
  );
} 