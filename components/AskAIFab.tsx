'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

const DISMISS_KEY = 'artha:ask-ai-fab-seen';

/**
 * Floating bottom-right "Ask AI" entry point for Artha Wealth.
 * Hidden on the /chat page itself and on auth pages.
 */
export function AskAIFab() {
  const pathname = usePathname() ?? '/';
  const [seen, setSeen] = useState(true); // default true to avoid SSR pulse flash

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(DISMISS_KEY);
      setSeen(v === '1');
    } catch {
      setSeen(true);
    }
  }, []);

  // Hide on the chat itself and on Clerk auth flows.
  if (
    pathname.startsWith('/chat') ||
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/sign-up')
  ) {
    return null;
  }

  function markSeen() {
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setSeen(true);
  }

  return (
    <Link
      href="/chat"
      onClick={markSeen}
      aria-label="Open Artha Wealth"
      className="group fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 px-4 py-3 text-white shadow-lg shadow-indigo-500/30 ring-1 ring-white/20 transition-all hover:scale-105 hover:shadow-xl hover:shadow-indigo-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 sm:bottom-6 sm:right-6"
    >
      <span className="relative flex h-5 w-5 items-center justify-center">
        <Sparkles className="h-5 w-5" />
        {!seen && (
          <span className="absolute -right-1 -top-1 inline-flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
          </span>
        )}
      </span>
      <span className="text-sm font-semibold tracking-tight">Ask AI</span>
      <span className="hidden rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider sm:inline">
        Artha Wealth
      </span>
    </Link>
  );
}

export default AskAIFab;
