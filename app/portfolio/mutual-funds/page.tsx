'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { MFHoldingsTable } from '@/components/Portfolio/MFHoldingsTable';
import { AddMFModal } from '@/components/Portfolio/AddMFModal';

interface MFItem {
  id: number;
  schemeCode: string;
  schemeName: string;
  amcName: string;
  units: number;
  avgNav: number;
  currentNav: number;
  investedAmount: number;
  currentValue: number;
  pnl: number;
  pnlPct: number;
  trailing1M: number;
  trailing3M: number;
  trailing1Y: number;
  direction?: 'positive' | 'negative' | 'sideways';
  consecutiveUnderperformMonths?: number;
}

export default function MutualFundsPage() {
  const [mfs, setMfs] = useState<MFItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/portfolio/overview');
      const text = await res.text();
      let data: { mfs: MFItem[]; error?: string };
      try {
        data = JSON.parse(text) as { mfs: MFItem[]; error?: string };
      } catch {
        throw new Error('Portfolio API returned invalid response');
      }
      if (!res.ok) throw new Error(data.error ?? 'Failed to load mutual funds');
      setMfs(data.mfs ?? []);
    } catch {
      setMfs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalValue = mfs.reduce((a, m) => a + m.currentValue, 0);
  const totalPnL = mfs.reduce((a, m) => a + m.pnl, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-stone-100">Mutual Funds</h1>
          {!loading && (
            <p className="text-stone-500 text-xs mt-0.5">
              {mfs.length} funds · ₹{totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })} value ·{' '}
              <span className={totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {totalPnL >= 0 ? '+' : ''}₹{totalPnL.toLocaleString('en-IN', { maximumFractionDigits: 0 })} P&L
              </span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => load()} className="p-2 text-stone-500 hover:text-stone-300 border border-stone-700 rounded-lg">
            <RefreshCw className="h-4 w-4" />
          </button>
          <Link
            href="/portfolio/assessment"
            className="flex items-center gap-1.5 text-sm border border-emerald-200 bg-emerald-50 text-emerald-700 font-semibold rounded-lg px-4 py-2 hover:bg-emerald-100"
          >
            <ShieldCheck className="h-4 w-4" /> Assessment
          </Link>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 text-sm bg-blue-600 text-white font-semibold rounded-lg px-4 py-2 hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" /> Add Fund
          </button>
        </div>
      </div>

      <div className="mb-4 bg-stone-900/50 border border-stone-800 rounded-xl px-4 py-3 text-xs text-stone-500">
        Direction badge indicates trailing 3-month performance. <span className="text-red-400">Negative</span> + consecutive months flags suggest reviewing the fund.
        P&L is calculated as current NAV × units − invested amount. NAV data from MFAPI.in.
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map((i) => <div key={i} className="h-12 bg-stone-900 border border-stone-800 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <MFHoldingsTable
          mfs={mfs}
          onDelete={(id) => setMfs((prev) => prev.filter((m) => m.id !== id))}
        />
      )}

      {showAdd && <AddMFModal onClose={() => setShowAdd(false)} onSaved={load} />}
    </div>
  );
}
