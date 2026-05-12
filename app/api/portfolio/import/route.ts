import { NextRequest, NextResponse } from 'next/server';
import { parse as parseCsv } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { hasDatabase, prisma } from '@/lib/db';
import { upsertLocalMfs, upsertLocalStocks } from '@/lib/local-portfolio-store';
import { getUserIdOrDevFallback } from '@/lib/server-auth';
import { STOCK_UNIVERSE } from '@/lib/universe';

type GenericRow = Record<string, unknown>;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function rowLookup(row: GenericRow): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[normalizeKey(k)] = v;
  return out;
}

function asString(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function asNumber(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = asString(v).replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function firstValue(row: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] != null && asString(row[key]) !== '') return row[key];
  }
  return undefined;
}

function parseRowsFromCsv(text: string): GenericRow[] {
  const records = parseCsv(text, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    trim: true,
  }) as GenericRow[];
  return records;
}

function parseRowsFromExcel(buffer: Buffer): GenericRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) return [];
  const ws = wb.Sheets[firstSheet];
  const json = XLSX.utils.sheet_to_json<GenericRow>(ws, { defval: '' });
  return json;
}

function parseRowsFromJson(text: string): GenericRow[] {
  const parsed = JSON.parse(text) as unknown;
  if (Array.isArray(parsed)) return parsed as GenericRow[];
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.stocks) || Array.isArray(obj.mutualFunds) || Array.isArray(obj.mfs)) {
      const rows: GenericRow[] = [];
      const stocks = (obj.stocks ?? []) as GenericRow[];
      const mfs = ((obj.mutualFunds ?? obj.mfs ?? []) as GenericRow[]);
      for (const s of stocks) rows.push({ type: 'stock', ...s });
      for (const m of mfs) rows.push({ type: 'mf', ...m });
      return rows;
    }
  }
  return [];
}

function classifyRow(row: Record<string, unknown>): 'stock' | 'mf' | 'unknown' {
  const type = asString(firstValue(row, ['type', 'assettype', 'instrumenttype'])).toLowerCase();
  if (type.includes('mf') || type.includes('mutual')) return 'mf';
  if (type.includes('stock') || type.includes('equity') || type.includes('share')) return 'stock';

  const hasSymbol = !!asString(firstValue(row, ['symbol', 'ticker', 'tradingsymbol', 'instrument']));
  const hasQty = asNumber(firstValue(row, ['qty', 'quantity', 'shares', 'unitsheld'])) > 0;
  const hasPrice = asNumber(firstValue(row, ['avgbuyprice', 'averageprice', 'buyprice', 'avgprice', 'purchaseprice', 'avgcost', 'averagecost'])) > 0;
  if (hasSymbol && hasQty && hasPrice) return 'stock';

  const hasScheme = !!asString(firstValue(row, ['schemecode', 'schemeid', 'isin', 'schemename', 'fundname']));
  const hasUnits = asNumber(firstValue(row, ['units', 'quantity', 'unitsheld'])) > 0;
  const hasNav = asNumber(firstValue(row, ['avgnav', 'nav', 'purchasenav', 'avgbuyprice'])) > 0;
  if (hasScheme && hasUnits && hasNav) return 'mf';

  return 'unknown';
}

function inferStockMeta(symbol: string): { name: string; sector: string } {
  const match = STOCK_UNIVERSE.find((s) => s.ticker === symbol);
  return {
    name: match?.name ?? symbol,
    sector: match?.sector ?? '',
  };
}

function fallbackSchemeCode(name: string, index: number): string {
  const slug = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20) || 'FUND';
  return `IMP_${slug}_${index}`;
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdOrDevFallback();
    if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    let rawRows: GenericRow[] = [];

    if (fileName.endsWith('.csv')) {
      rawRows = parseRowsFromCsv(buffer.toString('utf-8'));
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      rawRows = parseRowsFromExcel(buffer);
    } else if (fileName.endsWith('.json')) {
      rawRows = parseRowsFromJson(buffer.toString('utf-8'));
    } else {
      return NextResponse.json({ error: 'Unsupported file type. Use CSV, Excel, or JSON.' }, { status: 400 });
    }
    if (!rawRows.length) {
      return NextResponse.json({ error: 'No rows found in file' }, { status: 400 });
    }

    let skipped = 0;
    const warnings: string[] = [];
    const stocksToUpsert: any[] = [];
    const mfsToUpsert: any[] = [];

    for (let i = 0; i < rawRows.length; i += 1) {
      const normalized = rowLookup(rawRows[i]);
      const kind = classifyRow(normalized);

      if (kind === 'stock') {
        const symbol = asString(firstValue(normalized, ['symbol', 'ticker', 'tradingsymbol', 'instrument'])).toUpperCase();
        const qty = asNumber(firstValue(normalized, ['qty', 'qty.', 'quantity', 'shares', 'unitsheld']));
        const avgBuyPrice = asNumber(firstValue(normalized, ['avgbuyprice', 'averageprice', 'buyprice', 'avgprice', 'purchaseprice', 'avgcost', 'averagecost']));
        const accountId = asString(firstValue(normalized, ['accountid', 'account', 'brokeraccount'])) || 'default';
        const brokerName = asString(firstValue(normalized, ['brokername', 'broker', 'source'])) || 'Import';
        if (!symbol || qty <= 0 || avgBuyPrice <= 0) {
          skipped += 1;
          warnings.push(`Row ${i + 1}: skipped stock due to missing symbol/qty/avg price`);
          continue;
        }

        const meta = inferStockMeta(symbol);
        stocksToUpsert.push({
          symbol,
          accountId,
          name: asString(firstValue(normalized, ['name', 'companyname'])) || meta.name,
          sector: asString(firstValue(normalized, ['sector'])) || meta.sector,
          qty,
          avgBuyPrice,
          brokerName,
        });
        continue;
      }

      if (kind === 'mf') {
        const schemeName = asString(firstValue(normalized, ['schemename', 'fundname', 'name']));
        const schemeCode = asString(firstValue(normalized, ['schemecode', 'schemeid', 'isin'])) || fallbackSchemeCode(schemeName, i + 1);
        const units = asNumber(firstValue(normalized, ['units', 'quantity', 'unitsheld']));
        const avgNav = asNumber(firstValue(normalized, ['avgnav', 'nav', 'purchasenav', 'avgbuyprice']));
        const investedAmount = asNumber(firstValue(normalized, ['investedamount', 'invested', 'amount'])) || units * avgNav;

        if (!schemeName || units <= 0 || avgNav <= 0) {
          skipped += 1;
          warnings.push(`Row ${i + 1}: skipped MF due to missing scheme name/units/nav`);
          continue;
        }

        mfsToUpsert.push({
          schemeCode,
          schemeName,
          amcName: asString(firstValue(normalized, ['amcname', 'amc'])) || '',
          category: asString(firstValue(normalized, ['category'])) || 'Equity',
          units,
          avgNav,
          investedAmount,
        });
        continue;
      }

      skipped += 1;
      warnings.push(`Row ${i + 1}: could not classify row as stock or MF`);
    }

    if (hasDatabase) {
      const uniqueStocks = new Map<string, any>();
      for (const s of stocksToUpsert) {
        uniqueStocks.set(`${s.symbol}_${s.accountId}`, s);
      }
      const finalStocks = Array.from(uniqueStocks.values());

      const uniqueMfs = new Map<string, any>();
      for (const m of mfsToUpsert) {
        uniqueMfs.set(m.schemeCode, m);
      }
      const finalMfs = Array.from(uniqueMfs.values());

      const ops: any[] = [];
      const stocksToCreate: any[] = [];
      const mfsToCreate: any[] = [];

      if (finalStocks.length > 0) {
        const existingStocks = await prisma.stockHolding.findMany({
          where: {
            userId,
            symbol: { in: [...new Set(finalStocks.map((s) => s.symbol))] },
          },
          select: { symbol: true, accountId: true },
        });

        const existingStockSet = new Set(existingStocks.map((s) => `${s.symbol}_${s.accountId}`));

        for (const s of finalStocks) {
          if (existingStockSet.has(`${s.symbol}_${s.accountId}`)) {
            ops.push(prisma.stockHolding.update({
              where: { userId_symbol_accountId: { userId, symbol: s.symbol, accountId: s.accountId } },
              data: { qty: s.qty, avgBuyPrice: s.avgBuyPrice, brokerName: s.brokerName },
            }));
          } else {
            stocksToCreate.push({ userId, ...s });
          }
        }
      }

      if (finalMfs.length > 0) {
        const existingMfs = await prisma.mFHolding.findMany({
          where: {
            userId,
            schemeCode: { in: [...new Set(finalMfs.map((m) => m.schemeCode))] },
          },
          select: { schemeCode: true },
        });

        const existingMfSet = new Set(existingMfs.map((m) => m.schemeCode));

        for (const m of finalMfs) {
          if (existingMfSet.has(m.schemeCode)) {
            ops.push(prisma.mFHolding.update({
              where: { userId_schemeCode: { userId, schemeCode: m.schemeCode } },
              data: { units: m.units, avgNav: m.avgNav, investedAmount: m.investedAmount },
            }));
          } else {
            mfsToCreate.push({ userId, ...m });
          }
        }
      }

      // Group creations into minimal operations
      if (stocksToCreate.length > 0) ops.push(prisma.stockHolding.createMany({ data: stocksToCreate }));
      if (mfsToCreate.length > 0) ops.push(prisma.mFHolding.createMany({ data: mfsToCreate }));

      // Chunking transactions to avoid hitting potential statement limits or long locks
      const chunkSize = 50;
      for (let i = 0; i < ops.length; i += chunkSize) {
        await prisma.$transaction(ops.slice(i, i + chunkSize));
      }
    } else {
      if (stocksToUpsert.length > 0) {
        await upsertLocalStocks(userId, stocksToUpsert.map((s) => ({ ...s, buyDate: new Date().toISOString(), notes: '' })));
      }
      if (mfsToUpsert.length > 0) {
        await upsertLocalMfs(userId, mfsToUpsert.map((m) => ({ ...m, buyDate: new Date().toISOString() })));
      }
    }

    const stocksImported = stocksToUpsert.length;
    const mfImported = mfsToUpsert.length;

    return NextResponse.json({
      ok: true,
      totalRows: rawRows.length,
      stocksImported,
      mfImported,
      skipped,
      warnings: warnings.slice(0, 12),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Import failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
