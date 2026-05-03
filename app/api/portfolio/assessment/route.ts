import { NextRequest, NextResponse } from 'next/server';
import { parse as parseCsv } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { getAllMFSchemes, getCurrentNav, getMFDetail } from '@/lib/mfapi';
import { getUserIdOrDevFallback } from '@/lib/server-auth';
import {
  buildPortfolioAssessment,
  enrichHoldingClassification,
  type NormalizedPortfolioHolding,
} from '@/lib/portfolio-assessment';

type GenericRow = Record<string, unknown>;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function rowLookup(row: GenericRow): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) out[normalizeKey(key)] = value;
  return out;
}

function asString(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function asNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = asString(value).replace(/,/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstValue(row: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] != null && asString(row[key]) !== '') return row[key];
  }
  return undefined;
}

function parseRowsFromCsv(text: string): GenericRow[] {
  return parseCsv(text, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    trim: true,
  }) as GenericRow[];
}

function parseRowsFromExcel(buffer: Buffer): GenericRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return [];
  return XLSX.utils.sheet_to_json<GenericRow>(workbook.Sheets[firstSheet], { defval: '' });
}

function pickFileRows(fileName: string, buffer: Buffer): GenericRow[] {
  if (fileName.endsWith('.csv')) return parseRowsFromCsv(buffer.toString('utf-8'));
  if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) return parseRowsFromExcel(buffer);
  return [];
}

function fallbackId(name: string, rowNumber: number): string {
  const slug = name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'fund';
  return `${slug}-${rowNumber}`;
}

function findSchemeSuggestions(
  schemeName: string,
  schemes: Array<{ schemeCode: string; schemeName: string }>,
): Array<{ schemeCode: string; schemeName: string }> {
  const name = schemeName.toLowerCase();
  const tokens = name.split(/\s+/).filter((token) => token.length > 2);

  return schemes
    .map((scheme) => {
      const candidate = scheme.schemeName.toLowerCase();
      const score = tokens.reduce((sum, token) => sum + (candidate.includes(token) ? 1 : 0), 0);
      const bonus = candidate.includes(name) ? 5 : 0;
      return { ...scheme, score: score + bonus };
    })
    .filter((scheme) => scheme.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ schemeCode, schemeName: matchName }) => ({ schemeCode, schemeName: matchName }));
}

async function enrichHolding(
  row: Record<string, unknown>,
  rowNumber: number,
  schemes: Array<{ schemeCode: string; schemeName: string }>,
): Promise<NormalizedPortfolioHolding | null> {
  const schemeName = asString(firstValue(row, ['schemename', 'fundname', 'name', 'scheme']));
  if (!schemeName) return null;

  const schemeCode = asString(firstValue(row, ['schemecode', 'schemeid', 'amficode', 'code']));
  const amcName = asString(firstValue(row, ['amcname', 'amc', 'fundhouse']));
  const folioNumber = asString(firstValue(row, ['folionumber', 'folio', 'accountnumber'])) || undefined;
  const units = asNumber(firstValue(row, ['units', 'quantity', 'unitsheld']));
  const investedAmount = asNumber(firstValue(row, ['investedamount', 'invested', 'purchasevalue', 'costvalue', 'amount']));
  const providedCurrentValue = asNumber(firstValue(row, ['currentvalue', 'marketvalue', 'value', 'currentmarketvalue']));
  const providedCurrentNav = asNumber(firstValue(row, ['currentnav', 'nav', 'latestnav']));
  const assetClass = asString(firstValue(row, ['assetclass', 'assettype']));
  const category = asString(firstValue(row, ['category', 'subcategory', 'fundcategory']));

  const suggestions = findSchemeSuggestions(schemeName, schemes);
  const matchedSchemeCode = schemeCode || suggestions[0]?.schemeCode;

  let metadata = undefined;
  let currentNav = providedCurrentNav || undefined;

  if (matchedSchemeCode) {
    try {
      const detail = await getMFDetail(matchedSchemeCode);
      metadata = {
        schemeType: detail.meta.scheme_type,
        schemeCategory: detail.meta.scheme_category,
        schemeSubCategory: detail.meta.scheme_sub_category,
      };
      if (!currentNav) currentNav = await getCurrentNav(matchedSchemeCode);
    } catch {
      metadata = undefined;
    }
  }

  const classification = enrichHoldingClassification({
    schemeName,
    amcName,
    assetClass,
    category,
    metadata,
  });

  const normalizedCurrentValue =
    providedCurrentValue ||
    (currentNav && units > 0 ? currentNav * units : 0) ||
    investedAmount ||
    (units > 0 && providedCurrentNav > 0 ? units * providedCurrentNav : 0);

  return {
    id: fallbackId(schemeName, rowNumber),
    schemeName,
    schemeCode: matchedSchemeCode || undefined,
    amcName: amcName || 'Unknown AMC',
    folioNumber,
    units,
    investedAmount: investedAmount || normalizedCurrentValue,
    currentValue: normalizedCurrentValue,
    currentNav,
    assetClass,
    category,
    metadata,
    inferredAssetBucket: classification.inferredAssetBucket,
    inferredEquityBucket: classification.inferredEquityBucket,
    inferredSector: classification.inferredSector,
    assetBreakdown: classification.assetBreakdown,
    confidence: classification.confidence,
    inferenceSource: classification.inferenceSource,
    suggestionOptions: suggestions.map((suggestion) => suggestion.schemeName),
  };
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
    if (!fileName.endsWith('.csv') && !fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
      return NextResponse.json({ error: 'Unsupported file type. Please upload a CSV or Excel file.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const rawRows = pickFileRows(fileName, buffer);
    if (!rawRows.length) {
      return NextResponse.json({ error: 'No portfolio rows found in the uploaded file.' }, { status: 400 });
    }

    const schemes = await getAllMFSchemes();
    const normalizedRows = rawRows.map((row) => rowLookup(row));
    const enriched = await Promise.all(normalizedRows.map((row, index) => enrichHolding(row, index + 1, schemes)));
    const holdings = enriched.filter((holding): holding is NormalizedPortfolioHolding => Boolean(holding));

    if (!holdings.length) {
      return NextResponse.json({
        error: 'We could not recognize any mutual fund rows. Please include at least a scheme name and either current value, invested amount, or units.',
      }, { status: 400 });
    }

    const warnings = holdings
      .filter((holding) => holding.confidence === 'low')
      .map((holding) => `Low-confidence classification for ${holding.schemeName}. Consider reviewing manual mapping.`)
      .slice(0, 6);

    return NextResponse.json({
      ok: true,
      holdings,
      preliminaryAssessment: buildPortfolioAssessment(holdings),
      supportedFormats: ['.csv', '.xlsx', '.xls'],
      warnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Assessment upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
