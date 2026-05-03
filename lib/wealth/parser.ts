import {
  enrichHoldingClassification,
  type NormalizedPortfolioHolding,
} from '@/lib/portfolio-assessment';

function asNumber(value: string): number {
  const normalized = value.replace(/[₹,\s]/g, '').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function detectDelimiter(line: string): string {
  const candidates = [',', '\t', '|', ';'];
  let best = ',';
  let bestCount = -1;
  for (const candidate of candidates) {
    const count = line.split(candidate).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }
  return best;
}

function makeHolding(
  idSeed: number,
  schemeName: string,
  currentValue: number,
  investedAmount: number,
  units = 0,
  currentNav = 0,
  amcName = '',
  category = '',
  assetClass = '',
): NormalizedPortfolioHolding {
  const classification = enrichHoldingClassification({
    schemeName,
    amcName,
    category,
    assetClass,
    metadata: undefined,
  });

  return {
    id: `chat-${idSeed}-${schemeName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
    schemeName,
    schemeCode: undefined,
    amcName,
    folioNumber: undefined,
    units,
    investedAmount: investedAmount || currentValue,
    currentValue: currentValue || investedAmount,
    currentNav: currentNav || undefined,
    assetClass,
    category,
    metadata: undefined,
    inferredAssetBucket: classification.inferredAssetBucket,
    inferredEquityBucket: classification.inferredEquityBucket,
    inferredSector: classification.inferredSector,
    assetBreakdown: classification.assetBreakdown,
    confidence: classification.confidence,
    inferenceSource: classification.inferenceSource,
    suggestionOptions: [],
  };
}

function parseDelimitedRows(text: string): NormalizedPortfolioHolding[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 1) return [];

  const delimiter = detectDelimiter(lines[0]);
  const firstParts = lines[0].split(delimiter).map((part) => part.trim());
  const looksLikeHeader = firstParts.some((part) =>
    ['scheme', 'fund', 'name', 'invested', 'current', 'units', 'amc', 'category'].includes(normalizeHeader(part)),
  );

  const headers = looksLikeHeader ? firstParts.map(normalizeHeader) : [];
  const rows = (looksLikeHeader ? lines.slice(1) : lines).map((line) => line.split(delimiter).map((part) => part.trim()));

  const parsed = rows
    .map((parts, index) => {
      const row = headers.length
        ? Object.fromEntries(headers.map((header, headerIndex) => [header, parts[headerIndex] ?? '']))
        : {};

      const schemeName = headers.length
        ? String(row.schemename ?? row.fundname ?? row.name ?? '')
        : parts[0] ?? '';
      const investedAmount = headers.length
        ? asNumber(String(row.investedamount ?? row.invested ?? row.amount ?? row.purchasevalue ?? '0'))
        : asNumber(parts[1] ?? '0');
      const currentValue = headers.length
        ? asNumber(String(row.currentvalue ?? row.marketvalue ?? row.value ?? '0'))
        : asNumber(parts[2] ?? parts[1] ?? '0');
      const units = headers.length
        ? asNumber(String(row.units ?? row.quantity ?? '0'))
        : asNumber(parts[3] ?? '0');
      const currentNav = headers.length
        ? asNumber(String(row.currentnav ?? row.nav ?? '0'))
        : 0;
      const amcName = headers.length ? String(row.amcname ?? row.amc ?? '') : '';
      const category = headers.length ? String(row.category ?? row.subcategory ?? '') : '';
      const assetClass = headers.length ? String(row.assetclass ?? '') : '';

      if (!schemeName || (!currentValue && !investedAmount && !units)) return null;
      return makeHolding(index + 1, schemeName, currentValue, investedAmount, units, currentNav, amcName, category, assetClass);
    })
    .filter((holding): holding is NormalizedPortfolioHolding => Boolean(holding));

  return parsed;
}

function parseNaturalLanguageRows(text: string): NormalizedPortfolioHolding[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\-\*\d\.\)\s]+/, '').trim())
    .filter(Boolean);

  return lines
    .map((line, index) => {
      const amountMatches = Array.from(line.matchAll(/(?:₹\s*)?(\d[\d,]*(?:\.\d+)?)/g)).map((match) => asNumber(match[1]));
      if (amountMatches.length === 0) return null;
      const schemeName = line
        .replace(/(?:₹\s*)?\d[\d,]*(?:\.\d+)?/g, ' ')
        .replace(/\b(current|value|invested|amount|units|nav|folio|amc)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!schemeName || schemeName.length < 4) return null;
      const investedAmount = amountMatches[0] ?? 0;
      const currentValue = amountMatches[1] ?? amountMatches[0] ?? 0;
      return makeHolding(index + 1, schemeName, currentValue, investedAmount);
    })
    .filter((holding): holding is NormalizedPortfolioHolding => Boolean(holding));
}

export function parsePortfolioText(text: string): NormalizedPortfolioHolding[] {
  if (!text.trim()) return [];

  const delimited = parseDelimitedRows(text);
  if (delimited.length > 0) return delimited;

  return parseNaturalLanguageRows(text);
}

export function mergeHoldings(
  current: NormalizedPortfolioHolding[],
  incoming: NormalizedPortfolioHolding[],
): NormalizedPortfolioHolding[] {
  const map = new Map<string, NormalizedPortfolioHolding>();
  [...current, ...incoming].forEach((holding) => {
    map.set(holding.schemeName.toLowerCase(), holding);
  });
  return Array.from(map.values());
}
