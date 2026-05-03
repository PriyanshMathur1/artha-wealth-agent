import type { Metadata, Viewport } from 'next';
import './globals.css';
import Link from 'next/link';
import { Activity, BellRing, LayoutDashboard, MessageSquare, Search, Settings } from 'lucide-react';
import { ClerkProvider } from '@clerk/nextjs';
import { NavbarAuthButtons } from '@/components/NavbarAuthButtons';
import { AskAIFab } from '@/components/AskAIFab';

export const metadata: Metadata = {
  title: 'Artha — Smart Investing Workspace',
  description: 'Artha combines market screening, deep analysis, portfolio tracking, and rebalancing for Indian investors.',
  keywords: 'Artha, stock screener, Indian stocks, portfolio tracker, deep analysis, rebalancing',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Artha' },
};

export const viewport: Viewport = {
  themeColor: '#4f46e5',
};

function Navbar() {
  return (
    <nav className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 transition-colors group-hover:bg-indigo-100">
              <Activity className="h-4 w-4 text-indigo-600" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-slate-900">Artha</span>
            <span className="hidden rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500 sm:block">
              India
            </span>
          </Link>

          <div className="hidden items-center gap-1 sm:flex">
            <Link href="/" className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900">
              <Search className="h-3.5 w-3.5" /> Screener
            </Link>
            <Link href="/chat" className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900">
              <MessageSquare className="h-3.5 w-3.5" /> Artha Wealth
            </Link>
            <Link href="/portfolio" className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900">
              <LayoutDashboard className="h-3.5 w-3.5" /> Portfolio
            </Link>
            <Link href="/watchlist" className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900">
              <BellRing className="h-3.5 w-3.5" /> Watchlist
            </Link>
            <Link href="/settings" className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900">
              <Settings className="h-3.5 w-3.5" /> Settings
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <NavbarAuthButtons />
          </div>
        </div>
      </div>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="mt-14 border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-indigo-600" />
            <span className="text-sm font-medium text-slate-700">Artha</span>
          </div>
          <p className="max-w-xl text-xs leading-relaxed text-slate-500">
            Educational research only. Not investment advice. Consult a SEBI-registered advisor before making investment decisions.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 border-t border-slate-200 pt-4 text-[10px] text-slate-400">
          <span>Prices: Angel One + Yahoo Finance</span>
          <span>Fundamentals: Yahoo Finance</span>
          <span>MF NAV: MFAPI.in</span>
          <span>Created by Priyansh Mathur</span>
          <span>© {new Date().getFullYear()} Artha</span>
        </div>
      </div>
    </footer>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: '#4f46e5',
          colorBackground: '#ffffff',
          colorText: '#0f172a',
          colorTextSecondary: '#64748b',
          colorNeutral: '#e2e8f0',
          borderRadius: '0.75rem',
        },
        elements: {
          card: 'shadow-xl border border-slate-200',
          formButtonPrimary: 'bg-indigo-600 hover:bg-indigo-700 text-white',
          formFieldInput: 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-500',
          footerActionLink: 'text-indigo-600 hover:text-indigo-700',
        },
      }}
    >
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <script dangerouslySetInnerHTML={{ __html: `if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');` }} />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <Navbar />
        <main className="min-h-[calc(100vh-64px)]">
          {children}
        </main>
        <AskAIFab />
        <Footer />
      </body>
    </html>
    </ClerkProvider>
  );
}
