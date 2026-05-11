import type { HistoryBar } from './yahoo';

// RSI — Relative Strength Index (14-period standard)
export function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = closes.length - period; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta > 0) gains += delta;
    else losses += Math.abs(delta);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round(100 - 100 / (1 + rs));
}

export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
  trend: 'bullish' | 'bearish' | 'neutral';
}

// EMA calculator
function calcEMA(values: number[], period: number): number[] {
  if (values.length < period) return values.map(() => 0);
  const k = 2 / (period + 1);
  const ema: number[] = [];

  // Seed with SMA
  const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  ema.push(seed);

  for (let i = period; i < values.length; i++) {
    ema.push(values[i] * k + ema[ema.length - 1] * (1 - k));
  }
  return ema;
}

// MACD — 12/26/9
export function calcMACD(closes: number[]): MACDResult {
  if (closes.length < 35) {
    return { macd: 0, signal: 0, histogram: 0, trend: 'neutral' };
  }

  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);

  // Align lengths
  const offset = ema12.length - ema26.length;
  const macdLine: number[] = [];
  for (let i = 0; i < ema26.length; i++) {
    macdLine.push(ema12[i + offset] - ema26[i]);
  }

  const signalLine = calcEMA(macdLine, 9);
  const lastMACD = macdLine[macdLine.length - 1];
  const lastSignal = signalLine[signalLine.length - 1];
  const histogram = lastMACD - lastSignal;

  const trend: MACDResult['trend'] =
    histogram > 0 ? 'bullish' : histogram < 0 ? 'bearish' : 'neutral';

  return {
    macd: +lastMACD.toFixed(4),
    signal: +lastSignal.toFixed(4),
    histogram: +histogram.toFixed(4),
    trend,
  };
}

// DMA — Simple Moving Average
export function calcDMA(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] ?? 0;
  const slice = closes.slice(-period);
  return +(slice.reduce((a, b) => a + b, 0) / period).toFixed(2);
}

// ATR — Average True Range (14-period)
export function calcATR(bars: HistoryBar[], period = 14): number {
  if (bars.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const hl = bars[i].high - bars[i].low;
    const hc = Math.abs(bars[i].high - bars[i - 1].close);
    const lc = Math.abs(bars[i].low - bars[i - 1].close);
    trs.push(Math.max(hl, hc, lc));
  }
  const recent = trs.slice(-period);
  return +(recent.reduce((a, b) => a + b, 0) / recent.length).toFixed(2);
}

// Bollinger Bands (20-period, 2 std dev)
export interface BollingerBands {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;
}

export function calcBollinger(closes: number[], period = 20): BollingerBands {
  if (closes.length < period) {
    const p = closes[closes.length - 1] ?? 0;
    return { upper: p, middle: p, lower: p, bandwidth: 0 };
  }
  const slice = closes.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((acc, v) => acc + Math.pow(v - sma, 2), 0) / period;
  const std = Math.sqrt(variance);
  const upper = +(sma + 2 * std).toFixed(2);
  const lower = +(sma - 2 * std).toFixed(2);
  const bandwidth = +((upper - lower) / sma).toFixed(4);
  return { upper, middle: +sma.toFixed(2), lower, bandwidth };
}

// 52-week performance
export function calcPerformance52W(bars: HistoryBar[]): number {
  if (bars.length < 2) return 0;
  const oldest = bars[0].close;
  const latest = bars[bars.length - 1].close;
  return +((latest - oldest) / oldest * 100).toFixed(2);
}

// Volume ratio vs 20-day average
export function calcVolumeRatio(bars: HistoryBar[]): number {
  if (bars.length < 21) return 1;
  const recent = bars[bars.length - 1].volume;
  const avg = bars.slice(-21, -1).reduce((a, b) => a + b.volume, 0) / 20;
  return avg > 0 ? +(recent / avg).toFixed(2) : 1;
}

// On-Balance Volume trend over recent lookback
export function calcOBVTrend(bars: HistoryBar[], lookback = 20): 'rising' | 'falling' | 'neutral' {
  if (bars.length < lookback + 2) return 'neutral';
  const recent = bars.slice(-lookback - 1);
  let obv = 0;
  const obvSeries: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].close > recent[i - 1].close) obv += recent[i].volume;
    else if (recent[i].close < recent[i - 1].close) obv -= recent[i].volume;
    obvSeries.push(obv);
  }
  if (obvSeries.length < 4) return 'neutral';
  const mid = Math.floor(obvSeries.length / 2);
  const first = obvSeries.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
  const second = obvSeries.slice(mid).reduce((a, b) => a + b, 0) / (obvSeries.length - mid);
  if (second > first * 1.03) return 'rising';
  if (second < first * 0.97) return 'falling';
  return 'neutral';
}

// Ratio of average up-day volume to average down-day volume (>1 = accumulation)
export function calcUpDownVolumeRatio(bars: HistoryBar[], lookback = 20): number {
  const recent = bars.slice(-lookback);
  let upVol = 0, downVol = 0;
  for (const bar of recent) {
    if (bar.close >= bar.open) upVol += bar.volume;
    else downVol += bar.volume;
  }
  return downVol > 0 ? +(upVol / downVol).toFixed(2) : 2;
}

export interface PatternResult {
  name: string;
  bullish: boolean;
  confidence: 'high' | 'medium' | 'low';
}

export function detectChartPattern(
  bars: HistoryBar[],
  dma50: number,
  dma200: number,
  bollinger: BollingerBands,
): PatternResult {
  if (bars.length < 20) return { name: 'Insufficient data', bullish: false, confidence: 'low' };

  const recent20 = bars.slice(-20);
  const price = recent20[recent20.length - 1].close;
  const closes20 = recent20.map((b) => b.close);

  // Golden / Death Cross (50DMA crosses 200DMA)
  const prev50 = bars.length >= 52
    ? calcDMA(bars.slice(0, -2).map((b) => b.close), 50)
    : dma50;
  if (dma50 > dma200 && prev50 <= dma200) return { name: 'Golden Cross', bullish: true, confidence: 'high' };
  if (dma50 < dma200 && prev50 >= dma200) return { name: 'Death Cross', bullish: false, confidence: 'high' };

  // Bollinger Squeeze (very tight bands → energy building)
  if (bollinger.bandwidth < 0.04) {
    const breakingUp = price > bollinger.middle;
    return { name: breakingUp ? 'BB Squeeze Breakout (Up)' : 'BB Squeeze (Pending)', bullish: breakingUp, confidence: 'medium' };
  }

  // Bull Flag: strong first half, tight consolidation second half
  const first10 = closes20.slice(0, 10);
  const second10 = closes20.slice(10);
  const firstMove = first10[9] - first10[0];
  const secondRange = Math.max(...second10) - Math.min(...second10);
  const firstRange = Math.max(...first10) - Math.min(...first10);
  if (firstMove > 0 && firstRange > 0 && secondRange < firstRange * 0.38) {
    return { name: 'Bull Flag — Consolidation After Impulse', bullish: true, confidence: 'medium' };
  }

  // Bear Flag: sharp decline, then tight consolidation
  if (firstMove < 0 && firstRange > 0 && secondRange < firstRange * 0.38) {
    return { name: 'Bear Flag — Consolidation After Decline', bullish: false, confidence: 'medium' };
  }

  // Higher Highs / Higher Lows (last 20 bars)
  const highs = recent20.map((b) => b.high);
  const lows = recent20.map((b) => b.low);
  let hhCount = 0, hlCount = 0, lhCount = 0, llCount = 0;
  for (let i = 1; i < 20; i++) {
    if (highs[i] > highs[i - 1]) hhCount++;
    if (lows[i] > lows[i - 1]) hlCount++;
    if (highs[i] < highs[i - 1]) lhCount++;
    if (lows[i] < lows[i - 1]) llCount++;
  }
  if (hhCount >= 12 && hlCount >= 10) return { name: 'Higher Highs & Higher Lows — Uptrend', bullish: true, confidence: 'medium' };
  if (lhCount >= 12 && llCount >= 10) return { name: 'Lower Highs & Lower Lows — Downtrend', bullish: false, confidence: 'medium' };

  // Extended / Oversold
  if (price > bollinger.upper) return { name: 'Overbought — Above Upper Bollinger Band', bullish: false, confidence: 'low' };
  if (price < bollinger.lower) return { name: 'Oversold — Below Lower Bollinger Band', bullish: true, confidence: 'low' };

  return { name: 'Consolidation — No Clear Pattern', bullish: price > dma50, confidence: 'low' };
}

// Find local swing highs and lows (window of 3)
export function findSwings(bars: HistoryBar[]): { swingHighs: number[]; swingLows: number[] } {
  const swingHighs: number[] = [];
  const swingLows: number[] = [];
  for (let i = 1; i < bars.length - 1; i++) {
    if (bars[i].high > bars[i - 1].high && bars[i].high > bars[i + 1].high) swingHighs.push(bars[i].high);
    if (bars[i].low < bars[i - 1].low && bars[i].low < bars[i + 1].low) swingLows.push(bars[i].low);
  }
  return { swingHighs, swingLows };
}

// Nearest support / resistance from recent swing pivots
export interface KeyLevels {
  support1: number;
  support2: number;
  resistance1: number;
  resistance2: number;
}

export function calcKeyLevels(bars: HistoryBar[], dma50: number, dma200: number): KeyLevels {
  if (bars.length < 10) {
    const p = bars[bars.length - 1]?.close ?? 0;
    return { support1: p * 0.95, support2: p * 0.90, resistance1: p * 1.05, resistance2: p * 1.10 };
  }

  const price = bars[bars.length - 1].close;
  const recent = bars.slice(-60);

  const { swingHighs, swingLows } = findSwings(recent);

  // Add MAs as levels
  const supports = [...swingLows, dma50, dma200].filter((l) => l < price).sort((a, b) => b - a);
  const resistances = [...swingHighs, dma50, dma200].filter((l) => l > price).sort((a, b) => a - b);

  return {
    support1: supports[0] ?? price * 0.95,
    support2: supports[1] ?? price * 0.90,
    resistance1: resistances[0] ?? price * 1.05,
    resistance2: resistances[1] ?? price * 1.10,
  };
}

export interface TechnicalSummary {
  rsi: number;
  macd: MACDResult;
  dma50: number;
  dma200: number;
  atr: number;
  bollinger: BollingerBands;
  performance52W: number;
  volumeRatio: number;
  obvTrend: 'rising' | 'falling' | 'neutral';
  upDownVolumeRatio: number;
  pattern: PatternResult;
  keyLevels: KeyLevels;
  currentPrice: number;
  trend: 'strong_uptrend' | 'uptrend' | 'sideways' | 'downtrend' | 'strong_downtrend';
}

export function computeTechnicals(bars: HistoryBar[]): TechnicalSummary {
  const closes = bars.map((b) => b.close);
  const currentPrice = closes[closes.length - 1] ?? 0;

  const rsi = calcRSI(closes);
  const macd = calcMACD(closes);
  const dma50 = calcDMA(closes, 50);
  const dma200 = calcDMA(closes, 200);
  const atr = calcATR(bars);
  const bollinger = calcBollinger(closes);
  const performance52W = calcPerformance52W(bars);
  const volumeRatio = calcVolumeRatio(bars);
  const obvTrend = calcOBVTrend(bars);
  const upDownVolumeRatio = calcUpDownVolumeRatio(bars);
  const pattern = detectChartPattern(bars, dma50, dma200, bollinger);
  const keyLevels = calcKeyLevels(bars, dma50, dma200);

  let trend: TechnicalSummary['trend'];
  if (currentPrice > dma50 && dma50 > dma200 && rsi > 55) trend = 'strong_uptrend';
  else if (currentPrice > dma50 && currentPrice > dma200) trend = 'uptrend';
  else if (currentPrice < dma50 && dma50 < dma200 && rsi < 45) trend = 'strong_downtrend';
  else if (currentPrice < dma50 && currentPrice < dma200) trend = 'downtrend';
  else trend = 'sideways';

  return {
    rsi, macd, dma50, dma200, atr, bollinger,
    performance52W, volumeRatio, obvTrend, upDownVolumeRatio,
    pattern, keyLevels, currentPrice, trend,
  };
}
