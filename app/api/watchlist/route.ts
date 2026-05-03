import { NextRequest, NextResponse } from 'next/server';
import { hasDatabase, prisma } from '@/lib/db';
import { STOCK_UNIVERSE } from '@/lib/universe';
import { getValidToken } from '@/lib/angelone-session';
import { resolveToken } from '@/lib/scripmaster';
import { getUserIdOrDevFallback } from '@/lib/server-auth';

const API_BASE = process.env.ANGEL_ONE_API_BASE ?? '';

function angelHeaders(token: string) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'X-UserType': 'USER', 'X-SourceID': 'WEB',
    'X-PrivateKey': process.env.NEXT_PUBLIC_ANGEL_ONE_CLIENT_ID ?? '',
    'X-MACaddress': '00:00:00:00:00:00',
    'X-ClientLocalIP': '127.0.0.1', 'X-ClientPublicIP': '0.0.0.0',
  };
}

export async function GET() {
  const userId = await getUserIdOrDevFallback();
  if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  if (!hasDatabase) return NextResponse.json([]);

  const items = await prisma.watchlist.findMany({ where: { userId }, orderBy: { addedAt: 'desc' } });
  if (!items.length) return NextResponse.json([]);

  const jwtToken = await getValidToken();
  const tokenToSymbol = new Map<string, string>();
  for (const item of items) {
    let token = (await prisma.settings.findUnique({ where: { key: `angel_token_${item.symbol}` } }))?.value;
    if (!token) token = resolveToken(item.symbol) ?? undefined;
    if (token) tokenToSymbol.set(token, item.symbol);
  }

  const priceMap = new Map<string, { ltp: number; changePct: number; high52: number; low52: number; volume: number }>();
  if (jwtToken && tokenToSymbol.size > 0) {
    try {
      const res = await fetch(`${API_BASE}/rest/secure/angelbroking/market/v1/quote/`, {
        method: 'POST', headers: angelHeaders(jwtToken),
        body: JSON.stringify({ mode: 'FULL', exchangeTokens: { NSE: Array.from(tokenToSymbol.keys()) } }),
      });
      const data = await res.json() as { status: boolean; data?: { fetched: Array<{ symbolToken: string; ltp: number; percentChange: number; '52WeekHigh'?: number; '52WeekLow'?: number; tradeVolume: number }> } };
      if (data.status && data.data) {
        for (const q of data.data.fetched) {
          const sym = tokenToSymbol.get(q.symbolToken);
          if (sym) priceMap.set(sym, { ltp: q.ltp, changePct: q.percentChange, high52: q['52WeekHigh'] ?? 0, low52: q['52WeekLow'] ?? 0, volume: q.tradeVolume });
        }
      }
    } catch { /* no prices */ }
  }

  const rows = items.map((item) => {
    const p = priceMap.get(item.symbol);
    const range = (p?.high52 ?? 0) - (p?.low52 ?? 0);
    const pos = range > 0 ? (((p?.ltp ?? 0) - (p?.low52 ?? 0)) / range) * 100 : 0;
    const signal = pos >= 75 ? 'Strong Buy' : pos >= 55 ? 'Buy' : pos >= 35 ? 'Hold' : pos >= 15 ? 'Accumulate' : pos > 0 ? 'Sell' : 'Hold';
    return { ...item, price: p?.ltp ?? 0, changePct: p?.changePct ?? 0, high52: p?.high52 ?? 0, low52: p?.low52 ?? 0, volume: p?.volume ?? 0, signal };
  });

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdOrDevFallback();
  if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  if (!hasDatabase) {
    const { symbol } = await req.json() as { symbol: string };
    if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });
    const sym = symbol.toUpperCase();
    const info = STOCK_UNIVERSE.find((s) => s.ticker === sym);
    return NextResponse.json({ symbol: sym, name: info?.name ?? sym, sector: info?.sector ?? '' }, { status: 201 });
  }

  const { symbol } = await req.json() as { symbol: string };
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  const sym = symbol.toUpperCase();
  const info = STOCK_UNIVERSE.find((s) => s.ticker === sym);
  const existing = await prisma.watchlist.findFirst({ where: { userId, symbol: sym }, select: { id: true } });
  const item = existing
    ? await prisma.watchlist.findFirst({ where: { userId, symbol: sym } })
    : await prisma.watchlist.create({ data: { userId, symbol: sym, name: info?.name ?? sym, sector: info?.sector ?? '' } });
  return NextResponse.json(item, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserIdOrDevFallback();
  if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  if (!hasDatabase) return NextResponse.json({ ok: true });

  const symbol = new URL(req.url).searchParams.get('symbol')?.toUpperCase();
  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });
  await prisma.watchlist.deleteMany({ where: { userId, symbol } });
  return NextResponse.json({ ok: true });
}
