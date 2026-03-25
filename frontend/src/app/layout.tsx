import type { Metadata } from 'next'
import { Syne, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const syne = Syne({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-syne',
})

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-jetbrains',
})

export const metadata: Metadata = {
  title: 'ARXIS — Adaptive Regime-aware eXecution Intelligence System',
  description: 'Institutional-grade execution intelligence for NSE equities',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${jetbrains.variable}`}>
      <body className="bg-crust text-text font-mono overflow-hidden h-screen antialiased">
        {children}
      </body>
    </html>
  )
}
