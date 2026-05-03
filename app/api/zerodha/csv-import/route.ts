import { NextRequest, NextResponse } from 'next/server';
import { parseZerodhaCSV, parseZerodhaClientId } from '@/lib/zerodha';
import { hasDatabase, prisma } from '@/lib/db';
import { upsertLocalStock } from '@/lib/local-portfolio-store';
import { getUserIdOrDevFallback } from '@/lib/server-auth';
import { NIFTY_50, NIFTY_NEXT_50 } from '@/lib/universe';

const universe = [...NIFTY_50, ...NIFTY_NEXT_50];

function normaliseSector(raw: string): string {
  if (!raw) return '';
  const s = raw.replace(/-$/, '').trim();
  const map: Record<string, string> = {
    'ENGINEERING & CAPITAL GOODS': 'Capital Goods', 'ENGINEERING & C': 'Capital Goods',
    'AUTO ANCILLARY': 'Auto', 'FINANCIAL SERVICES': 'Financial Services', 'FINANCIAL SERVI': 'Financial Services',
    'CONSUMER DURABLES': 'Consumer', 'CONSUMER DURA': 'Consumer',
    'TOURISM & HOSPITALITY': 'Tourism', 'TOURISM & HOSP': 'Tourism',
    'BUILDING MATERIALS': 'Real Estate', 'BUILDING MATER': 'Real Estate',
    'SOFTWARE SERVICES': 'IT', 'SOFTWARE SERVI': 'IT',
  };
  return map[s.toUpperCase()] ?? s;
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdOrDevFallback();
  if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const text = await file.text();
    const accountId = parseZerodhaClientId(text);
    const rows = parseZerodhaCSV(text);

    if (!rows.length) {
      return NextResponse.json({ error: 'No valid rows found in CSV.' }, { status: 400 });
    }

    const results = await Promise.all(
      rows.map(async (row) => {
        const info = universe.find((s) => s.ticker === row.symbol);
        const sector = row.sector ? normaliseSector(row.sector) : (info?.sector ?? '');
        const name = info?.name ?? row.symbol;
        if (hasDatabase) {
          const existing = await prisma.stockHolding.findFirst({
            where: { userId, symbol: row.symbol, accountId },
            select: { id: true },
          });
          if (existing) {
            return prisma.stockHolding.update({
              where: { id: existing.id },
              data: { qty: row.qty, avgBuyPrice: row.avgPrice, brokerName: `Zerodha (${accountId})`, sector },
            });
          }
          return prisma.stockHolding.create({
            data: { userId, symbol: row.symbol, accountId, name, sector, qty: row.qty, avgBuyPrice: row.avgPrice, brokerName: `Zerodha (${accountId})` },
          });
        }
        return upsertLocalStock(userId, {
          symbol: row.symbol,
          accountId,
          name,
          sector,
          qty: row.qty,
          avgBuyPrice: row.avgPrice,
          brokerName: `Zerodha (${accountId})`,
          buyDate: new Date().toISOString(),
          notes: '',
        });
      })
    );

    const skipped = rows.filter((r) => r.avgPrice === 0).map((r) => r.symbol);
    return NextResponse.json({
      imported: results.length, accountId, skippedZeroAvg: skipped,
      message: skipped.length > 0
        ? `Imported ${results.length} holdings for account ${accountId}. Note: ${skipped.join(', ')} have ₹0 avg price — update manually.`
        : `Imported ${results.length} holdings for account ${accountId}.`,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Import failed' }, { status: 500 });
  }
}
