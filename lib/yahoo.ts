import YahooFinance from 'yahoo-finance2';

// Instantiate Yahoo Finance (required for v3)
const yahooFinance = new YahooFinance();

// Retry wrapper for transient Yahoo Finance 429 / network errors
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 2000): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (retries > 0 && (msg.includes('Too Many') || msg.includes('429') || msg.includes('network'))) {
      await new Promise((r) => setTimeout(r, delayMs));
      return withRetry(fn, retries - 1, delayMs * 2);
    }
    throw err;
  }
}

// In-memory cache with TTL
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

function n(val: unknown): number {
  const v = Number(val);
  return isNaN(v) ? 0 : v;
}

function nn(val: unknown): number | null {
  if (val == null) return null;
  const v = Number(val);
  return isNaN(v) ? null : v;
}

function s(val: unknown): string {
  return val == null ? '' : String(val);
}

// Zerodha uses a "-F" suffix for fractional ETF series (e.g. LIQUIDBEES-F → LIQUIDBEES).
// Strip it before looking up on Yahoo Finance.
function normaliseZerodhaTicker(ticker: string): string {
  return ticker.endsWith('-F') ? ticker.slice(0, -2) : ticker;
}

export function toNSSymbol(ticker: string): string {
  if (ticker.endsWith('.NS') || ticker.endsWith('.BO')) return ticker;
  return `${normaliseZerodhaTicker(ticker)}.NS`;
}

export interface QuoteData {
  symbol: string;
  shortName: string;
  longName: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketVolume: number;
  regularMarketOpen: number;
  regularMarketDayHigh: number;
  regularMarketDayLow: number;
  regularMarketPreviousClose: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  marketCap: number;
  currency: string;
  exchangeName: string;
  quoteType: string;
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  dividendYield: number | null;
  averageVolume: number;
  averageVolume10days: number;
  fiftyDayAverage: number;
  twoHundredDayAverage: number;
  earningsTimestamp: number | null;
  epsTrailingTwelveMonths: number | null;
  epsForward: number | null;
  bookValue: number | null;
}

export interface SummaryData {
  price: Record<string, unknown>;
  summaryDetail: Record<string, unknown>;
  defaultKeyStatistics: Record<string, unknown>;
  financialData: Record<string, unknown>;
  incomeStatementHistory: Record<string, unknown>;
  balanceSheetHistory: Record<string, unknown>;
  cashflowStatementHistory: Record<string, unknown>;
  earnings: Record<string, unknown>;
  assetProfile: Record<string, unknown>;
  recommendationTrend: Record<string, unknown>;
}

export interface HistoryBar {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjClose?: number;
}

export async function getQuote(ticker: string): Promise<QuoteData> {
  const symbol = toNSSymbol(ticker);
  const cacheKey = `quote:${symbol}`;
  const cached = getCached<QuoteData>(cacheKey);
  if (cached) return cached;

  const result = await withRetry(() => yahooFinance.quote(symbol));

  const data: QuoteData = {
    symbol: s(result.symbol) || symbol,
    shortName: s(result.shortName),
    longName: s(result.longName) || s(result.shortName),
    regularMarketPrice: n(result.regularMarketPrice),
    regularMarketChange: n(result.regularMarketChange),
    regularMarketChangePercent: n(result.regularMarketChangePercent),
    regularMarketVolume: n(result.regularMarketVolume),
    regularMarketOpen: n(result.regularMarketOpen),
    regularMarketDayHigh: n(result.regularMarketDayHigh),
    regularMarketDayLow: n(result.regularMarketDayLow),
    regularMarketPreviousClose: n(result.regularMarketPreviousClose),
    fiftyTwoWeekHigh: n(result.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: n(result.fiftyTwoWeekLow),
    marketCap: n(result.marketCap),
    currency: s(result.currency) || 'INR',
    exchangeName: s(result.fullExchangeName) || 'NSE',
    quoteType: s(result.quoteType) || 'EQUITY',
    trailingPE: nn(result.trailingPE),
    forwardPE: nn(result.forwardPE),
    priceToBook: nn(result.priceToBook),
    dividendYield: nn(result.dividendYield),
    averageVolume: n(result.averageVolume),
    averageVolume10days: n(result.averageVolume10days),
    fiftyDayAverage: n(result.fiftyDayAverage),
    twoHundredDayAverage: n(result.twoHundredDayAverage),
    earningsTimestamp: result.earningsTimestamp instanceof Date
      ? result.earningsTimestamp.getTime() / 1000
      : nn(result.earningsTimestamp),
    epsTrailingTwelveMonths: nn(result.epsTrailingTwelveMonths),
    epsForward: nn(result.epsForward),
    bookValue: nn(result.bookValue),
  };

  setCached(cacheKey, data);
  return data;
}

export async function getSummary(ticker: string): Promise<SummaryData> {
  const symbol = toNSSymbol(ticker);
  const cacheKey = `summary:${symbol}`;
  const cached = getCached<SummaryData>(cacheKey);
  if (cached) return cached;

  const modules = [
    'price',
    'summaryDetail',
    'defaultKeyStatistics',
    'financialData',
    'incomeStatementHistory',
    'balanceSheetHistory',
    'cashflowStatementHistory',
    'earnings',
    'assetProfile',
    'recommendationTrend',
  ] as const;

  const result = await withRetry(() => yahooFinance.quoteSummary(symbol, { modules: [...modules] }));

  const data: SummaryData = {
    price: (result.price as Record<string, unknown>) ?? {},
    summaryDetail: (result.summaryDetail as Record<string, unknown>) ?? {},
    defaultKeyStatistics: (result.defaultKeyStatistics as Record<string, unknown>) ?? {},
    financialData: (result.financialData as Record<string, unknown>) ?? {},
    incomeStatementHistory: (result.incomeStatementHistory as Record<string, unknown>) ?? {},
    balanceSheetHistory: (result.balanceSheetHistory as Record<string, unknown>) ?? {},
    cashflowStatementHistory: (result.cashflowStatementHistory as unknown as Record<string, unknown>) ?? {},
    earnings: (result.earnings as Record<string, unknown>) ?? {},
    assetProfile: (result.assetProfile as Record<string, unknown>) ?? {},
    recommendationTrend: (result.recommendationTrend as Record<string, unknown>) ?? {},
  };

  setCached(cacheKey, data);
  return data;
}

export async function getHistory(
  ticker: string,
  period: '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y' = '1y'
): Promise<HistoryBar[]> {
  const symbol = toNSSymbol(ticker);
  const cacheKey = `history:${symbol}:${period}`;
  const cached = getCached<HistoryBar[]>(cacheKey);
  if (cached) return cached;

  const result = await withRetry(() => yahooFinance.chart(symbol, {
    period1: getPeriodStart(period),
    period2: new Date(),
    interval: '1d',
  }));

  const data: HistoryBar[] = (result.quotes || [])
    .filter((bar) => bar.close != null)
    .map((bar) => ({
      date: bar.date instanceof Date ? bar.date : new Date(s(bar.date)),
      open: n(bar.open),
      high: n(bar.high),
      low: n(bar.low),
      close: n(bar.close),
      volume: n(bar.volume),
      adjClose: nn(bar.adjclose) ?? n(bar.close),
    }));

  setCached(cacheKey, data);
  return data;
}

export async function getFundamentals(ticker: string) {
  return getSummary(ticker);
}

function getPeriodStart(period: string): Date {
  const now = new Date();
  const map: Record<string, number> = {
    '1mo': 30,
    '3mo': 90,
    '6mo': 180,
    '1y': 365,
    '2y': 730,
    '5y': 1825,
  };
  const days = map[period] ?? 365;
  now.setDate(now.getDate() - days);
  return now;
}
