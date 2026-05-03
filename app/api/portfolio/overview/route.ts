import { NextResponse } from 'next/server';
import { hasDatabase, prisma } from '@/lib/db';
import { getLocalMfs, getLocalStocks } from '@/lib/local-portfolio-store';
import { getUserIdOrDevFallback } from '@/lib/server-auth';
import { getQuote as yahooQuote } from '@/lib/yahoo';
import { getCurrentNav, getMFDirection } from '@/lib/mfapi';
import { getValidToken } from '@/lib/angelone-session';

const API_BASE = process.env.ANGEL_ONE_API_BASE ?? '';

function angelHeaders(token: string) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'X-UserType': 'USER',
    'X-SourceID': 'WEB',
    'X-PrivateKey': process.env.NEXT_PUBLIC_ANGEL_ONE_CLIENT_ID ?? '',
    'X-MACaddress': '00:00:00:00:00:00',
    'X-ClientLocalIP': '127.0.0.1',
    'X-ClientPublicIP': '0.0.0.0',
  };
}

interface AngelHolding {
  tradingsymbol: string;
  quantity: number;
  averageprice: number;
  ltp: number;
  close: number;
  profitandloss: number;
  pnlpercentage: number;
  symboltoken: string;
}

async function fetchAngelHoldings(token: string): Promise<Map<string, AngelHolding>> {
  const res = await fetch(
    `${API_BASE}/rest/secure/angelbroking/portfolio/v1/getAllHolding`,
    { method: 'GET', headers: angelHeaders(token) }
  );
  const json = await res.json() as { status: boolean; data?: { holdings: AngelHolding[] } };
  if (!json.status || !json.data) return new Map();
  const map = new Map<string, AngelHolding>();
  for (const h of json.data.holdings) {
    const sym = h.tradingsymbol.replace(/-EQ$/, '');
    map.set(sym, h);
  }
  return map;
}

export async function GET() {
  try {
    const userId = await getUserIdOrDevFallback();
    if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const [stocks, mfs, cachedTokens] = hasDatabase
      ? await Promise.all([
          prisma.stockHolding.findMany({ where: { userId } }),
          prisma.mFHolding.findMany({ where: { userId } }),
          prisma.settings.findMany({ where: { key: { startsWith: 'angel_token_' } } }),
        ])
      : await Promise.all([
          getLocalStocks(userId),
          getLocalMfs(userId),
          Promise.resolve([] as Array<{ key: string; value: string }>),
        ]);

    const jwtToken = await getValidToken();

    // Build symbol → token maps
    const symbolToToken = new Map<string, string>();
    const tokenToSymbol = new Map<string, string>();
    for (const r of cachedTokens) {
      const sym = r.key.replace('angel_token_', '');
      symbolToToken.set(sym, r.value);
      tokenToSymbol.set(r.value, sym);
    }

    // Fetch Angel One prices via bulk quote
    let angelPrices = new Map<string, { ltp: number; dayChangePct: number }>();
    if (jwtToken && tokenToSymbol.size > 0) {
      try {
        const tokens = Array.from(tokenToSymbol.keys());
        const CHUNK = 50;
        for (let i = 0; i < tokens.length; i += CHUNK) {
          const chunk = tokens.slice(i, i + CHUNK);
          const res = await fetch(`${API_BASE}/rest/secure/angelbroking/market/v1/quote/`, {
            method: 'POST',
            headers: angelHeaders(jwtToken),
            body: JSON.stringify({ mode: 'FULL', exchangeTokens: { NSE: chunk } }),
          });
          const data = await res.json() as { status: boolean; data?: { fetched: Array<{ symbolToken: string; ltp: number; close: number }> } };
          if (data.status && data.data) {
            for (const q of data.data.fetched) {
              const sym = tokenToSymbol.get(q.symbolToken);
              if (sym) angelPrices.set(sym, { ltp: q.ltp, dayChangePct: q.close > 0 ? ((q.ltp - q.close) / q.close) * 100 : 0 });
            }
          }
        }
      } catch { /* fall through */ }
    }

    // Stock items with live prices
    const stockItems = await Promise.all(
      stocks.map(async (s) => {
        const base = { id: s.id, symbol: s.symbol, accountId: s.accountId, name: s.name, sector: s.sector, qty: s.qty, avgBuyPrice: s.avgBuyPrice, brokerName: s.brokerName, buyDate: s.buyDate };

        const angel = angelPrices.get(s.symbol);
        if (angel && angel.ltp > 0) {
          const cmp = angel.ltp;
          return { ...base, cmp, dayChangePct: angel.dayChangePct, currentValue: cmp * s.qty, invested: s.avgBuyPrice * s.qty, pnl: (cmp - s.avgBuyPrice) * s.qty, pnlPct: s.avgBuyPrice > 0 ? ((cmp - s.avgBuyPrice) / s.avgBuyPrice) * 100 : 0, quoteFailed: false, priceSource: 'angel' as const };
        }

        try {
          const q = await yahooQuote(s.symbol);
          const cmp = q.regularMarketPrice;
          return { ...base, cmp, dayChangePct: q.regularMarketChangePercent, currentValue: cmp * s.qty, invested: s.avgBuyPrice * s.qty, pnl: (cmp - s.avgBuyPrice) * s.qty, pnlPct: s.avgBuyPrice > 0 ? ((cmp - s.avgBuyPrice) / s.avgBuyPrice) * 100 : 0, quoteFailed: false, priceSource: 'yahoo' as const };
        } catch {
          return { ...base, cmp: s.avgBuyPrice, dayChangePct: 0, currentValue: s.avgBuyPrice * s.qty, invested: s.avgBuyPrice * s.qty, pnl: 0, pnlPct: 0, quoteFailed: true, priceSource: 'none' as const };
        }
      })
    );

    // MF items — correct P&L using actual current NAV × units
    const mfItems = await Promise.all(
      mfs.map(async (m) => {
        try {
          const [currentNav, direction] = await Promise.all([
            getCurrentNav(m.schemeCode),
            getMFDirection(m.schemeCode),
          ]);
          const currentValue = currentNav * m.units;
          const pnl = currentValue - m.investedAmount;
          const pnlPct = m.investedAmount > 0 ? (pnl / m.investedAmount) * 100 : 0;
          const trailing1M = direction.trailing3M !== null ? direction.trailing3M / 3 : 0;
          return {
            id: m.id, schemeCode: m.schemeCode, schemeName: m.schemeName, amcName: m.amcName,
            units: m.units, avgNav: m.avgNav, currentNav, investedAmount: m.investedAmount,
            currentValue, pnl, pnlPct,
            trailing1M, trailing3M: direction.trailing3M ?? 0, trailing1Y: direction.trailing1Y ?? 0,
            direction: direction.status, consecutiveUnderperformMonths: direction.consecutiveUnderperformMonths,
          };
        } catch {
          return {
            id: m.id, schemeCode: m.schemeCode, schemeName: m.schemeName, amcName: m.amcName,
            units: m.units, avgNav: m.avgNav, currentNav: m.avgNav, investedAmount: m.investedAmount,
            currentValue: m.investedAmount, pnl: 0, pnlPct: 0,
            trailing1M: 0, trailing3M: 0, trailing1Y: 0,
            direction: 'sideways' as const, consecutiveUnderperformMonths: 0,
          };
        }
      })
    );

    const totalStockValue    = stockItems.reduce((a, i) => a + i.currentValue, 0);
    const totalStockInvested = stockItems.reduce((a, i) => a + i.invested, 0);
    const totalMFValue       = mfItems.reduce((a, i) => a + i.currentValue, 0);
    const totalMFInvested    = mfItems.reduce((a, i) => a + i.investedAmount, 0);
    const totalValue         = totalStockValue + totalMFValue;
    const totalInvested      = totalStockInvested + totalMFInvested;
    const totalPnL           = totalValue - totalInvested;
    const totalPnLPct        = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;
    const todayChange        = stockItems.reduce((a, i) => a + i.currentValue * (i.dayChangePct / 100), 0);

    const sectorAllocation: Record<string, number> = {};
    stockItems.forEach((s) => {
      if (s.currentValue > 0) sectorAllocation[s.sector] = (sectorAllocation[s.sector] ?? 0) + s.currentValue;
    });

    const angelCount = stockItems.filter((s) => s.priceSource === 'angel').length;

    return NextResponse.json({
      summary: { totalValue, totalInvested, totalPnL, totalPnLPct, totalStockValue, totalMFValue, todayChange },
      stocks: stockItems,
      mfs: mfItems,
      sectorAllocation,
      priceSource: angelCount > 0 ? 'angel' : 'yahoo',
      angelPriceCount: angelCount,
      totalStocks: stockItems.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load portfolio overview';
    return NextResponse.json({ error: message, stocks: [], mfs: [], summary: { totalStockValue: 0, totalInvested: 0, totalPnL: 0, totalPnLPct: 0 } }, { status: 500 });
  }
}
