'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, RefreshCw, BarChart2, TrendingUp, Bell, ShieldCheck } from 'lucide-react';
import { PortfolioSummary, EmptyPortfolio } from '@/components/Portfolio/PortfolioSummary';
import { ZerodhaImport } from '@/components/Portfolio/ZerodhaImport';
import { AngelOnePanel } from '@/components/AngelOnePanel';
import { PortfolioImport } from '@/components/Portfolio/PortfolioImport';

interface StockRow {
  symbol: string;
  name: string;
  sector: string;
  pnlPct: number;
  currentValue: number;
  invested: number;
  pnl: number;
  accountId: string;
}

interface MFRow {
  schemeCode: string;
  schemeName: string;
  pnlPct: number;
  currentValue: number;
  investedAmount: number;
  pnl: number;
}

interface OverviewData {
  summary: {
    totalValue: number; totalInvested: number; totalPnL: number;
    totalPnLPct: number; totalStockValue: number; totalMFValue: number; todayChange: number;
  };
  stocks: StockRow[];
  mfs: MFRow[];
  sectorAllocation: Record<string, number>;
  priceSource?: 'angel' | 'yahoo';
}

function fmt(n: number) {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function AccountSummaryCards({ stocks, mfValue, mfInvested, mfPnL }: {
  stocks: StockRow[];
  mfValue: number;
  mfInvested: number;
  mfPnL: number;
}) {
  const stockValue    = stocks.reduce((a, s) => a + s.currentValue, 0);
  const stockInvested = stocks.reduce((a, s) => a + s.invested, 0);
  const stockPnL      = stocks.reduce((a, s) => a + s.pnl, 0);
  const totalValue    = stockValue + mfValue;
  const totalInvested = stockInvested + mfInvested;
  const totalPnL      = stockPnL + mfPnL;
  const totalPnLPct   = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

  const cards = [
    { label: 'Total Value', value: `₹${fmt(totalValue)}`, sub: `Invested ₹${fmt(totalInvested)}`, color: 'text-stone-100' },
    { label: 'Total P&L', value: `${totalPnL >= 0 ? '+' : ''}₹${fmt(totalPnL)}`, sub: `${totalPnLPct >= 0 ? '+' : ''}${totalPnLPct.toFixed(2)}%`, color: totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400' },
    { label: 'Stocks', value: `₹${fmt(stockValue)}`, sub: `${stockPnL >= 0 ? '+' : ''}₹${fmt(stockPnL)} P&L`, color: 'text-amber-400' },
    { label: 'Mutual Funds', value: `₹${fmt(mfValue)}`, sub: `${mfPnL >= 0 ? '+' : ''}₹${fmt(mfPnL)} P&L`, color: 'text-blue-400' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {cards.map((c) => (
        <div key={c.label} className="bg-stone-900 border border-stone-800 rounded-xl p-5">
          <p className="text-xs text-stone-500 mb-1">{c.label}</p>
          <p className={`text-lg font-bold font-mono ${c.color}`}>{c.value}</p>
          <p className="text-xs text-stone-600 mt-0.5">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}

export default function PortfolioDashboard() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeAccount, setActiveAccount] = useState<string>('all');

  async function load(showRefresh = false) {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch('/api/portfolio/overview');
      const d = await res.json() as OverviewData;
      setData(d);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  const accounts = data
    ? ['all', ...Array.from(new Set(data.stocks.map((s) => s.accountId))).sort()]
    : ['all'];

  const visibleStocks = !data ? [] :
    activeAccount === 'all' ? data.stocks : data.stocks.filter((s) => s.accountId === activeAccount);

  // MFs are not account-specific — show only in "all" view, hide per-account
  const showMFs = activeAccount === 'all';
  const mfValue    = data?.mfs.reduce((a, m) => a + m.currentValue, 0) ?? 0;
  const mfInvested = data?.mfs.reduce((a, m) => a + m.investedAmount, 0) ?? 0;
  const mfPnL      = data?.mfs.reduce((a, m) => a + m.pnl, 0) ?? 0;

  // Sector allocation for visible stocks only
  const sectorAlloc: Record<string, number> = {};
  const totalVisible = visibleStocks.reduce((a, s) => a + s.currentValue, 0);
  visibleStocks.forEach((s) => {
    if (s.currentValue > 0 && s.sector)
      sectorAlloc[s.sector] = (sectorAlloc[s.sector] ?? 0) + s.currentValue;
  });
  const sectorPcts = Object.entries(sectorAlloc)
    .map(([k, v]) => [k, totalVisible > 0 ? (v / totalVisible) * 100 : 0] as [string, number])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const isEmpty = data && data.stocks.length === 0 && data.mfs.length === 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-stone-100">Portfolio</h1>
            {data?.priceSource === 'angel' && (
              <span className="text-[10px] font-semibold text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded px-2 py-0.5">
                Angel One live prices
              </span>
            )}
          </div>
          <p className="text-stone-500 text-sm mt-0.5">Your investments at a glance</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-200 border border-stone-700 rounded-lg px-3 py-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link href="/portfolio/stocks" className="flex items-center gap-1.5 text-xs bg-amber-500 text-stone-950 font-semibold rounded-lg px-3 py-1.5 hover:bg-amber-400">
            <Plus className="h-3.5 w-3.5" /> Add Stock
          </Link>
          <Link href="/portfolio/mutual-funds" className="flex items-center gap-1.5 text-xs bg-blue-600 text-white font-semibold rounded-lg px-3 py-1.5 hover:bg-blue-500">
            <Plus className="h-3.5 w-3.5" /> Add MF
          </Link>
          <Link href="/portfolio/assessment" className="flex items-center gap-1.5 text-xs bg-emerald-600 text-white font-semibold rounded-lg px-3 py-1.5 hover:bg-emerald-500">
            <ShieldCheck className="h-3.5 w-3.5" /> Portfolio Assessment
          </Link>
        </div>
      </div>

      {/* Account tabs */}
      {accounts.length > 2 && (
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {accounts.map((acc) => {
            const count = acc === 'all'
              ? data?.stocks.length ?? 0
              : data?.stocks.filter((s) => s.accountId === acc).length ?? 0;
            const accValue = acc === 'all'
              ? (data?.summary.totalStockValue ?? 0)
              : (data?.stocks.filter((s) => s.accountId === acc).reduce((a, s) => a + s.currentValue, 0) ?? 0);
            return (
              <button
                key={acc}
                onClick={() => setActiveAccount(acc)}
                className={`flex flex-col items-start px-4 py-2.5 rounded-xl border transition-all ${
                  activeAccount === acc
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-stone-700 hover:border-stone-600 bg-stone-900'
                }`}
              >
                <span className={`text-xs font-semibold ${activeAccount === acc ? 'text-amber-400' : 'text-stone-400'}`}>
                  {acc === 'all' ? 'All Accounts' : `Account ${acc}`}
                </span>
                <span className="text-[10px] text-stone-500 mt-0.5">
                  {count} stocks · ₹{fmt(accValue)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[1,2,3,4].map((i) => (
            <div key={i} className="bg-stone-900 border border-stone-800 rounded-xl p-5 animate-pulse h-24" />
          ))}
        </div>
      )}

      {isEmpty && <EmptyPortfolio />}

      {data && !isEmpty && (
        <>
          <AccountSummaryCards
            stocks={visibleStocks}
            mfValue={showMFs ? mfValue : 0}
            mfInvested={showMFs ? mfInvested : 0}
            mfPnL={showMFs ? mfPnL : 0}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Stocks card */}
              <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <BarChart2 className="h-4 w-4 text-amber-400" />
                    <h2 className="font-semibold text-stone-200">
                      {activeAccount === 'all' ? 'Stocks' : `Account ${activeAccount} — Stocks`}
                    </h2>
                    <span className="text-xs text-stone-500">({visibleStocks.length})</span>
                  </div>
                  <Link href="/portfolio/stocks" className="text-xs text-amber-400 hover:text-amber-300">View all →</Link>
                </div>
                {visibleStocks.slice(0, 6).map((s) => (
                  <div key={`${s.accountId}-${s.symbol}`} className="flex items-center justify-between py-2 border-b border-stone-800/50 last:border-0">
                    <div>
                      <span className="text-sm font-mono font-bold text-stone-200">{s.symbol}</span>
                      <span className="text-xs text-stone-500 ml-2">{s.sector}</span>
                      {activeAccount === 'all' && accounts.length > 2 && (
                        <span className="text-[10px] text-stone-600 ml-1.5 border border-stone-800 rounded px-1">
                          {s.accountId}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-stone-400">₹{fmt(s.currentValue)}</p>
                      <p className={`text-xs font-semibold ${s.pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {s.pnlPct >= 0 ? '+' : ''}{s.pnlPct.toFixed(2)}%
                      </p>
                    </div>
                  </div>
                ))}
                {visibleStocks.length > 6 && (
                  <p className="text-xs text-stone-600 mt-3 text-center">
                    +{visibleStocks.length - 6} more ·{' '}
                    <Link href="/portfolio/stocks" className="text-amber-500 hover:text-amber-400">View all</Link>
                  </p>
                )}
              </div>

              {/* MF card — only in "all" view */}
              {showMFs && data.mfs.length > 0 && (
                <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-blue-400" />
                      <h2 className="font-semibold text-stone-200">Mutual Funds</h2>
                      <span className="text-xs text-stone-500">({data.mfs.length})</span>
                    </div>
                    <Link href="/portfolio/mutual-funds" className="text-xs text-blue-400 hover:text-blue-300">View all →</Link>
                  </div>
                  {data.mfs.slice(0, 5).map((m) => (
                    <div key={m.schemeCode} className="flex items-center justify-between py-2 border-b border-stone-800/50 last:border-0">
                      <span className="text-xs text-stone-300 flex-1 truncate pr-4">{m.schemeName}</span>
                      <div className="text-right">
                        <p className="text-xs text-stone-400">₹{fmt(m.currentValue ?? 0)}</p>
                        <p className={`text-xs font-semibold ${m.pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {m.pnlPct >= 0 ? '+' : ''}{m.pnlPct.toFixed(2)}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              {/* Sector allocation — filtered to active account */}
              <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
                <h2 className="font-semibold text-stone-200 mb-4">
                  Sector Allocation
                  {activeAccount !== 'all' && <span className="text-xs font-normal text-stone-500 ml-1">· {activeAccount}</span>}
                </h2>
                {sectorPcts.map(([sector, pct]) => (
                  <div key={sector} className="mb-2">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-stone-400">{sector}</span>
                      <span className="text-stone-300 font-mono">{pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 bg-stone-800 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500/60 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Bell className="h-4 w-4 text-stone-400" />
                  <h2 className="font-semibold text-stone-200">Quick Actions</h2>
                </div>
                <div className="space-y-2">
                  <Link href="/rebalance" className="flex items-center gap-2 w-full text-xs text-stone-400 hover:text-amber-400 border border-stone-700 hover:border-amber-500/40 rounded-lg px-3 py-2 transition-colors">
                    Run Rebalancing Analysis
                  </Link>
                  <Link href="/alerts" className="flex items-center gap-2 w-full text-xs text-stone-400 hover:text-stone-200 border border-stone-700 rounded-lg px-3 py-2 transition-colors">
                    View All Alerts
                  </Link>
                  <Link href="/portfolio/assessment" className="flex items-center gap-2 w-full text-xs text-stone-400 hover:text-emerald-500 border border-stone-700 hover:border-emerald-500/40 rounded-lg px-3 py-2 transition-colors">
                    Run Mutual Fund Portfolio Assessment
                  </Link>
                </div>
              </div>

              <AngelOnePanel onSynced={() => load(true)} />
              <PortfolioImport onImported={() => load(true)} />
              <ZerodhaImport onImported={() => load(true)} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
