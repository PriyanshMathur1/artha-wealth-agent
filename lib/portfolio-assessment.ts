export type AssetBucket = 'equity' | 'debt' | 'commodity' | 'international' | 'others';

export type EquityBucket =
  | 'large_cap'
  | 'mid_cap'
  | 'small_cap'
  | 'flexi_multi_cap'
  | 'sectoral_thematic'
  | 'international_offshore';

export type RiskProfile =
  | 'Conservative'
  | 'Moderate Conservative'
  | 'Balanced'
  | 'Growth'
  | 'Aggressive';

export interface AllocationRange {
  min: number;
  max: number;
}

export interface SchemeMetadata {
  schemeType?: string;
  schemeCategory?: string;
  schemeSubCategory?: string;
}

export interface NormalizedPortfolioHolding {
  id: string;
  schemeName: string;
  schemeCode?: string;
  amcName: string;
  folioNumber?: string;
  units: number;
  investedAmount: number;
  currentValue: number;
  currentNav?: number;
  assetClass?: string;
  category?: string;
  metadata?: SchemeMetadata;
  inferredAssetBucket: AssetBucket;
  inferredEquityBucket?: EquityBucket;
  inferredSector: string;
  assetBreakdown: Record<AssetBucket, number>;
  confidence: 'high' | 'medium' | 'low';
  inferenceSource: string[];
  suggestionOptions?: string[];
}

export interface RiskQuestionOption {
  label: string;
  score: number;
  helper: string;
}

export interface RiskQuestion {
  id: string;
  label: string;
  section: 'Risk Capacity' | 'Risk Willingness' | 'Risk Behaviour';
  weightLabel: string;
  options: RiskQuestionOption[];
}

export interface RiskProfileResult {
  score: number;
  profile: RiskProfile;
  sectionScores: Record<RiskQuestion['section'], number>;
}

export interface AllocationRow {
  key: string;
  label: string;
  currentPct: number;
  idealRange?: AllocationRange;
  recommendation: string;
  status: 'under' | 'over' | 'ideal' | 'review';
}

export interface ConcentrationSummary {
  totalSchemes: number;
  amcConcentration: Array<{ name: string; pct: number }>;
  schemeConcentration: Array<{ name: string; pct: number }>;
  alerts: string[];
}

export interface PortfolioAssessment {
  totalPortfolioValue: number;
  totalInvestedAmount: number;
  holdings: NormalizedPortfolioHolding[];
  assetRows: AllocationRow[];
  equityRows: AllocationRow[];
  sectorRows: AllocationRow[];
  concentration: ConcentrationSummary;
  insights: string[];
  disclaimer: string;
  riskProfile?: RiskProfileResult;
}

const PROFILE_BANDS: Array<{ profile: RiskProfile; min: number; max: number }> = [
  { profile: 'Conservative', min: 0, max: 25 },
  { profile: 'Moderate Conservative', min: 26, max: 45 },
  { profile: 'Balanced', min: 46, max: 65 },
  { profile: 'Growth', min: 66, max: 80 },
  { profile: 'Aggressive', min: 81, max: 100 },
];

export const ASSET_LABELS: Record<AssetBucket, string> = {
  equity: 'Equity',
  debt: 'Debt',
  commodity: 'Commodity / Gold',
  international: 'International / Offshore',
  others: 'Others',
};

export const EQUITY_LABELS: Record<EquityBucket, string> = {
  large_cap: 'Large Cap',
  mid_cap: 'Mid Cap',
  small_cap: 'Small Cap',
  flexi_multi_cap: 'Flexi Cap / Multi Cap',
  sectoral_thematic: 'Sectoral / Thematic',
  international_offshore: 'International / Offshore Equity',
};

const STANDARD_SECTORS = ['Financials', 'Automobile', 'Energy', 'Healthcare', 'Technology', 'FMCG', 'Others'] as const;

const DEFAULT_DISCLAIMER =
  'This assessment is based on the information provided by you and publicly available mutual fund data. It is for educational and portfolio review purposes only and should not be considered investment advice.';

const HYBRID_SPLITS: Record<string, Record<AssetBucket, number>> = {
  aggressive: { equity: 0.7, debt: 0.25, commodity: 0, international: 0, others: 0.05 },
  conservative: { equity: 0.25, debt: 0.7, commodity: 0, international: 0, others: 0.05 },
  balancedadvantage: { equity: 0.55, debt: 0.35, commodity: 0, international: 0, others: 0.1 },
  dynamicassetallocation: { equity: 0.55, debt: 0.35, commodity: 0, international: 0, others: 0.1 },
  equitysavings: { equity: 0.35, debt: 0.55, commodity: 0, international: 0, others: 0.1 },
  arbitrage: { equity: 0.1, debt: 0.85, commodity: 0, international: 0, others: 0.05 },
  multiasset: { equity: 0.4, debt: 0.3, commodity: 0.2, international: 0, others: 0.1 },
};

export const IDEAL_ALLOCATIONS: Record<
  RiskProfile,
  {
    assets: Record<AssetBucket, AllocationRange>;
    equity: Record<EquityBucket, AllocationRange>;
    sector: { min: number; max: number };
  }
> = {
  Conservative: {
    assets: {
      equity: { min: 20, max: 35 },
      debt: { min: 55, max: 70 },
      commodity: { min: 5, max: 10 },
      international: { min: 0, max: 5 },
      others: { min: 0, max: 10 },
    },
    equity: {
      large_cap: { min: 45, max: 65 },
      mid_cap: { min: 10, max: 20 },
      small_cap: { min: 0, max: 8 },
      flexi_multi_cap: { min: 15, max: 30 },
      sectoral_thematic: { min: 0, max: 8 },
      international_offshore: { min: 0, max: 8 },
    },
    sector: { min: 0, max: 18 },
  },
  'Moderate Conservative': {
    assets: {
      equity: { min: 30, max: 45 },
      debt: { min: 40, max: 55 },
      commodity: { min: 5, max: 10 },
      international: { min: 0, max: 6 },
      others: { min: 0, max: 10 },
    },
    equity: {
      large_cap: { min: 40, max: 60 },
      mid_cap: { min: 10, max: 22 },
      small_cap: { min: 2, max: 10 },
      flexi_multi_cap: { min: 15, max: 30 },
      sectoral_thematic: { min: 0, max: 10 },
      international_offshore: { min: 0, max: 10 },
    },
    sector: { min: 0, max: 20 },
  },
  Balanced: {
    assets: {
      equity: { min: 45, max: 60 },
      debt: { min: 30, max: 45 },
      commodity: { min: 5, max: 10 },
      international: { min: 5, max: 10 },
      others: { min: 0, max: 10 },
    },
    equity: {
      large_cap: { min: 35, max: 55 },
      mid_cap: { min: 12, max: 25 },
      small_cap: { min: 4, max: 12 },
      flexi_multi_cap: { min: 15, max: 28 },
      sectoral_thematic: { min: 0, max: 12 },
      international_offshore: { min: 5, max: 15 },
    },
    sector: { min: 0, max: 22 },
  },
  Growth: {
    assets: {
      equity: { min: 60, max: 75 },
      debt: { min: 15, max: 25 },
      commodity: { min: 5, max: 12 },
      international: { min: 8, max: 14 },
      others: { min: 0, max: 10 },
    },
    equity: {
      large_cap: { min: 30, max: 45 },
      mid_cap: { min: 15, max: 28 },
      small_cap: { min: 6, max: 15 },
      flexi_multi_cap: { min: 12, max: 22 },
      sectoral_thematic: { min: 5, max: 15 },
      international_offshore: { min: 10, max: 18 },
    },
    sector: { min: 0, max: 25 },
  },
  Aggressive: {
    assets: {
      equity: { min: 72, max: 88 },
      debt: { min: 0, max: 10 },
      commodity: { min: 10, max: 20 },
      international: { min: 13.5, max: 16.5 },
      others: { min: 0, max: 10 },
    },
    equity: {
      large_cap: { min: 25, max: 40 },
      mid_cap: { min: 15, max: 30 },
      small_cap: { min: 8, max: 18 },
      flexi_multi_cap: { min: 8, max: 20 },
      sectoral_thematic: { min: 5, max: 18 },
      international_offshore: { min: 12, max: 22 },
    },
    sector: { min: 0, max: 28 },
  },
};

export const MANUAL_ASSET_OPTIONS = [
  'Equity',
  'Debt',
  'Commodity / Gold',
  'International / Offshore',
  'Hybrid / Others',
];

export const MANUAL_CATEGORY_OPTIONS = [
  'Large Cap',
  'Mid Cap',
  'Small Cap',
  'Flexi Cap',
  'Multi Cap',
  'Sectoral / Thematic',
  'International / Offshore Equity',
  'Debt',
  'Gold / Commodity',
  'Hybrid',
  'Other',
];

export const RISK_QUESTIONS: RiskQuestion[] = [
  {
    id: 'age',
    label: 'What is your age group?',
    section: 'Risk Capacity',
    weightLabel: 'Capacity',
    options: [
      { label: '60 or above', score: 0, helper: 'Lower time available for recovery.' },
      { label: '46 to 59', score: 4, helper: 'Moderate ability to absorb volatility.' },
      { label: '31 to 45', score: 8, helper: 'Good time horizon for long-term compounding.' },
      { label: '30 or below', score: 12, helper: 'Longest recovery runway.' },
    ],
  },
  {
    id: 'goal',
    label: 'What best describes your primary investment goal?',
    section: 'Risk Capacity',
    weightLabel: 'Capacity',
    options: [
      { label: 'Capital protection', score: 0, helper: 'Priority is preserving capital.' },
      { label: 'Regular income', score: 4, helper: 'Some growth, but stability matters more.' },
      { label: 'Balanced wealth creation', score: 7, helper: 'Mix of growth and stability.' },
      { label: 'Long-term wealth growth', score: 10, helper: 'Higher growth orientation.' },
    ],
  },
  {
    id: 'horizon',
    label: 'When do you expect to need this money?',
    section: 'Risk Capacity',
    weightLabel: 'Capacity',
    options: [
      { label: 'Within 3 years', score: 0, helper: 'Short horizon limits risk-taking capacity.' },
      { label: '3 to 5 years', score: 4, helper: 'Moderate time horizon.' },
      { label: '5 to 10 years', score: 8, helper: 'Long enough for market cycles.' },
      { label: 'More than 10 years', score: 12, helper: 'Highest capacity for long-term allocation.' },
    ],
  },
  {
    id: 'income',
    label: 'How stable is your income today?',
    section: 'Risk Capacity',
    weightLabel: 'Capacity',
    options: [
      { label: 'Unstable or uncertain', score: 0, helper: 'Volatility may feel harder to manage.' },
      { label: 'Somewhat stable', score: 4, helper: 'Moderate cushion for drawdowns.' },
      { label: 'Stable salaried/business income', score: 7, helper: 'Better ability to continue SIPs/investing.' },
      { label: 'Very stable with multiple income sources', score: 10, helper: 'Highest buffer against market swings.' },
    ],
  },
  {
    id: 'emergency',
    label: 'Do you have an emergency fund available outside this portfolio?',
    section: 'Risk Capacity',
    weightLabel: 'Capacity',
    options: [
      { label: 'No emergency fund', score: 0, helper: 'Portfolio may need to serve as a liquidity reserve.' },
      { label: 'Less than 3 months of expenses', score: 4, helper: 'Partial cushion only.' },
      { label: '3 to 6 months of expenses', score: 7, helper: 'Reasonable safety net.' },
      { label: 'More than 6 months of expenses', score: 10, helper: 'Strong liquidity cushion.' },
    ],
  },
  {
    id: 'dependency',
    label: 'How dependent are you on this money for near-term life goals?',
    section: 'Risk Capacity',
    weightLabel: 'Capacity',
    options: [
      { label: 'Highly dependent', score: 0, helper: 'Lower room for short-term volatility.' },
      { label: 'Moderately dependent', score: 5, helper: 'Some flexibility, but not complete.' },
      { label: 'Low dependency', score: 8, helper: 'Can stay invested through market cycles.' },
      { label: 'Not dependent in the near term', score: 12, helper: 'Maximum flexibility for long-term positioning.' },
    ],
  },
  {
    id: 'volatility',
    label: 'How would you react if your portfolio fell by 20% temporarily?',
    section: 'Risk Willingness',
    weightLabel: 'Willingness',
    options: [
      { label: 'I would exit most risky investments', score: 0, helper: 'Lower comfort with volatility.' },
      { label: 'I would reduce some exposure', score: 4, helper: 'Partial tolerance for drawdowns.' },
      { label: 'I would stay invested and wait', score: 8, helper: 'Comfortable with temporary declines.' },
      { label: 'I would stay invested or add gradually', score: 12, helper: 'Highest tolerance for volatility.' },
    ],
  },
  {
    id: 'expectation',
    label: 'Which return pattern best matches your preference?',
    section: 'Risk Willingness',
    weightLabel: 'Willingness',
    options: [
      { label: 'Lower but steadier returns', score: 0, helper: 'Strong preference for consistency.' },
      { label: 'Moderate growth with manageable fluctuations', score: 5, helper: 'Balanced preference.' },
      { label: 'Higher growth with occasional volatility', score: 8, helper: 'Comfort with drawdowns for growth.' },
      { label: 'Maximum growth despite sharp swings', score: 12, helper: 'Strong growth-first preference.' },
    ],
  },
  {
    id: 'behaviour',
    label: 'Which statement best matches your market behaviour during the COVID fall and the 2020–2021 rally?',
    section: 'Risk Behaviour',
    weightLabel: 'Behaviour',
    options: [
      { label: 'I was not invested or exited during the fall', score: 0, helper: 'Limited evidence of staying power.' },
      { label: 'I was invested but reduced exposure significantly', score: 3, helper: 'Some participation, lower persistence.' },
      { label: 'I stayed invested through most of the period', score: 7, helper: 'Good behavioural resilience.' },
      { label: 'I stayed invested and continued investing during the recovery', score: 10, helper: 'Strong long-term behaviour under stress.' },
    ],
  },
];

function compactText(...parts: Array<string | undefined>): string {
  return parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function percent(value: number, total: number): number {
  if (total <= 0) return 0;
  return (value / total) * 100;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function keywordMatch(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function classifySector(text: string): string {
  if (keywordMatch(text, ['bank', 'banking', 'financial', 'finance', 'psu bank'])) return 'Financials';
  if (keywordMatch(text, ['auto', 'automobile'])) return 'Automobile';
  if (keywordMatch(text, ['energy', 'power', 'oil', 'gas', 'infrastructure', 'infra', 'utilities'])) return 'Energy';
  if (keywordMatch(text, ['health', 'healthcare', 'pharma', 'pharmaceutical', 'hospital', 'biotech'])) return 'Healthcare';
  if (keywordMatch(text, ['tech', 'technology', 'digital', 'it ', 'software', 'innovation'])) return 'Technology';
  if (keywordMatch(text, ['fmcg', 'consumption', 'consumer', 'brand'])) return 'FMCG';
  return 'Others';
}

function categoryFromText(text: string): {
  assetBreakdown: Record<AssetBucket, number>;
  assetBucket: AssetBucket;
  equityBucket?: EquityBucket;
  sector: string;
  confidence: 'high' | 'medium' | 'low';
  inferenceSource: string[];
} {
  const inferenceSource: string[] = [];
  const sector = classifySector(text);

  if (keywordMatch(text, ['international', 'offshore', 'global', 'world', 'nasdaq', 'fof overseas', 'us equity'])) {
    inferenceSource.push('international-keyword');
    return {
      assetBreakdown: { equity: 0, debt: 0, commodity: 0, international: 1, others: 0 },
      assetBucket: 'international',
      equityBucket: 'international_offshore',
      sector,
      confidence: 'high',
      inferenceSource,
    };
  }

  if (keywordMatch(text, ['gold', 'commodity', 'silver'])) {
    inferenceSource.push('commodity-keyword');
    return {
      assetBreakdown: { equity: 0, debt: 0, commodity: 1, international: 0, others: 0 },
      assetBucket: 'commodity',
      sector: 'Others',
      confidence: 'high',
      inferenceSource,
    };
  }

  if (keywordMatch(text, ['liquid', 'ultra short', 'money market', 'gilt', 'bond', 'income', 'debt', 'corporate bond', 'credit risk', 'short duration', 'banking and psu'])) {
    inferenceSource.push('debt-keyword');
    return {
      assetBreakdown: { equity: 0, debt: 1, commodity: 0, international: 0, others: 0 },
      assetBucket: 'debt',
      sector: 'Others',
      confidence: 'high',
      inferenceSource,
    };
  }

  if (keywordMatch(text, ['hybrid', 'equity savings', 'balanced advantage', 'dynamic asset allocation', 'aggressive hybrid', 'conservative hybrid', 'arbitrage', 'multi asset'])) {
    const splitKey = keywordMatch(text, ['aggressive hybrid']) ? 'aggressive'
      : keywordMatch(text, ['conservative hybrid']) ? 'conservative'
      : keywordMatch(text, ['balanced advantage']) ? 'balancedadvantage'
      : keywordMatch(text, ['dynamic asset allocation']) ? 'dynamicassetallocation'
      : keywordMatch(text, ['equity savings']) ? 'equitysavings'
      : keywordMatch(text, ['arbitrage']) ? 'arbitrage'
      : 'multiasset';
    inferenceSource.push(`hybrid-${splitKey}`);
    return {
      assetBreakdown: HYBRID_SPLITS[splitKey],
      assetBucket: HYBRID_SPLITS[splitKey].equity >= HYBRID_SPLITS[splitKey].debt ? 'equity' : 'debt',
      equityBucket: HYBRID_SPLITS[splitKey].equity > 0.35 ? 'flexi_multi_cap' : undefined,
      sector: 'Others',
      confidence: 'medium',
      inferenceSource,
    };
  }

  if (keywordMatch(text, ['small cap'])) {
    inferenceSource.push('small-cap-keyword');
    return {
      assetBreakdown: { equity: 1, debt: 0, commodity: 0, international: 0, others: 0 },
      assetBucket: 'equity',
      equityBucket: 'small_cap',
      sector,
      confidence: 'high',
      inferenceSource,
    };
  }

  if (keywordMatch(text, ['mid cap'])) {
    inferenceSource.push('mid-cap-keyword');
    return {
      assetBreakdown: { equity: 1, debt: 0, commodity: 0, international: 0, others: 0 },
      assetBucket: 'equity',
      equityBucket: 'mid_cap',
      sector,
      confidence: 'high',
      inferenceSource,
    };
  }

  if (keywordMatch(text, ['large cap', 'bluechip', 'large & mid'])) {
    inferenceSource.push('large-cap-keyword');
    return {
      assetBreakdown: { equity: 1, debt: 0, commodity: 0, international: 0, others: 0 },
      assetBucket: 'equity',
      equityBucket: 'large_cap',
      sector,
      confidence: 'high',
      inferenceSource,
    };
  }

  if (keywordMatch(text, ['flexi cap', 'multi cap', 'focused', 'value', 'contra'])) {
    inferenceSource.push('flexi-keyword');
    return {
      assetBreakdown: { equity: 1, debt: 0, commodity: 0, international: 0, others: 0 },
      assetBucket: 'equity',
      equityBucket: 'flexi_multi_cap',
      sector,
      confidence: 'high',
      inferenceSource,
    };
  }

  if (keywordMatch(text, ['sectoral', 'thematic', 'banking', 'financial', 'pharma', 'technology', 'consumption', 'infrastructure', 'energy', 'fmcg'])) {
    inferenceSource.push('sectoral-keyword');
    return {
      assetBreakdown: { equity: 1, debt: 0, commodity: 0, international: 0, others: 0 },
      assetBucket: 'equity',
      equityBucket: 'sectoral_thematic',
      sector,
      confidence: 'medium',
      inferenceSource,
    };
  }

  if (keywordMatch(text, ['equity', 'elss', 'index', 'nifty', 'sensex'])) {
    inferenceSource.push('equity-keyword');
    return {
      assetBreakdown: { equity: 1, debt: 0, commodity: 0, international: 0, others: 0 },
      assetBucket: 'equity',
      equityBucket: 'flexi_multi_cap',
      sector: 'Others',
      confidence: 'medium',
      inferenceSource,
    };
  }

  return {
    assetBreakdown: { equity: 0, debt: 0, commodity: 0, international: 0, others: 1 },
    assetBucket: 'others',
    sector: 'Others',
    confidence: 'low',
    inferenceSource: ['fallback-others'],
  };
}

export function enrichHoldingClassification(
  base: Pick<NormalizedPortfolioHolding, 'schemeName' | 'amcName' | 'assetClass' | 'category' | 'metadata'>,
): Omit<
  NormalizedPortfolioHolding,
  'id' | 'schemeCode' | 'folioNumber' | 'units' | 'investedAmount' | 'currentValue' | 'currentNav' | 'suggestionOptions'
> {
  const text = compactText(
    base.schemeName,
    base.assetClass,
    base.category,
    base.metadata?.schemeType,
    base.metadata?.schemeCategory,
    base.metadata?.schemeSubCategory,
    base.amcName,
  );

  const classification = categoryFromText(text);
  return {
    schemeName: base.schemeName,
    amcName: base.amcName,
    assetClass: base.assetClass,
    category: base.category,
    metadata: base.metadata,
    inferredAssetBucket: classification.assetBucket,
    inferredEquityBucket: classification.equityBucket,
    inferredSector: classification.sector,
    assetBreakdown: classification.assetBreakdown,
    confidence: classification.confidence,
    inferenceSource: classification.inferenceSource,
  };
}

function allocationStatus(currentPct: number, range?: AllocationRange): AllocationRow['status'] {
  if (!range) return 'review';
  if (currentPct < range.min) return 'under';
  if (currentPct > range.max) return 'over';
  return 'ideal';
}

function allocationRecommendation(label: string, currentPct: number, range?: AllocationRange): string {
  if (!range) return 'Consider reviewing this exposure in context of overall diversification.';
  if (currentPct < range.min) {
    return `You may be under-allocated. Consider reviewing a ${round2(range.min - currentPct)}% gap relative to the ideal range.`;
  }
  if (currentPct > range.max) {
    return `You may be over-allocated. Consider reviewing a ${round2(currentPct - range.max)}% excess over the ideal range.`;
  }
  return `${label} appears to be within the ideal allocation range for this risk profile.`;
}

export function scoreRiskProfile(answers: Record<string, number>): RiskProfileResult {
  const sectionScores: RiskProfileResult['sectionScores'] = {
    'Risk Capacity': 0,
    'Risk Willingness': 0,
    'Risk Behaviour': 0,
  };

  let score = 0;
  for (const question of RISK_QUESTIONS) {
    const points = answers[question.id] ?? 0;
    sectionScores[question.section] += points;
    score += points;
  }

  const matched = PROFILE_BANDS.find((band) => score >= band.min && score <= band.max) ?? PROFILE_BANDS[0];
  return { score, profile: matched.profile, sectionScores };
}

export function buildPortfolioAssessment(
  holdings: NormalizedPortfolioHolding[],
  answers?: Record<string, number>,
): PortfolioAssessment {
  const totalPortfolioValue = holdings.reduce((sum, holding) => sum + Math.max(holding.currentValue, 0), 0);
  const totalInvestedAmount = holdings.reduce((sum, holding) => sum + Math.max(holding.investedAmount, 0), 0);

  const assetTotals: Record<AssetBucket, number> = {
    equity: 0,
    debt: 0,
    commodity: 0,
    international: 0,
    others: 0,
  };
  const equityTotals: Record<EquityBucket, number> = {
    large_cap: 0,
    mid_cap: 0,
    small_cap: 0,
    flexi_multi_cap: 0,
    sectoral_thematic: 0,
    international_offshore: 0,
  };
  const sectorTotals: Record<string, number> = {};
  const amcTotals: Record<string, number> = {};
  const schemeTotals: Record<string, number> = {};

  holdings.forEach((holding) => {
    const value = Math.max(holding.currentValue, 0);
    (Object.keys(assetTotals) as AssetBucket[]).forEach((bucket) => {
      assetTotals[bucket] += value * (holding.assetBreakdown[bucket] ?? 0);
    });

    if (holding.inferredEquityBucket) {
      equityTotals[holding.inferredEquityBucket] += value;
    }

    sectorTotals[holding.inferredSector] = (sectorTotals[holding.inferredSector] ?? 0) + value;
    amcTotals[holding.amcName || 'Unknown AMC'] = (amcTotals[holding.amcName || 'Unknown AMC'] ?? 0) + value;
    schemeTotals[holding.schemeName] = (schemeTotals[holding.schemeName] ?? 0) + value;
  });

  const riskProfile = answers ? scoreRiskProfile(answers) : undefined;
  const ideal = riskProfile ? IDEAL_ALLOCATIONS[riskProfile.profile] : undefined;
  const equityTotal = Object.values(equityTotals).reduce((sum, value) => sum + value, 0);

  const assetRows = (Object.keys(ASSET_LABELS) as AssetBucket[]).map((bucket) => {
    const currentPct = percent(assetTotals[bucket], totalPortfolioValue);
    const idealRange = ideal?.assets[bucket];
    return {
      key: bucket,
      label: ASSET_LABELS[bucket],
      currentPct: round2(currentPct),
      idealRange,
      status: allocationStatus(currentPct, idealRange),
      recommendation: allocationRecommendation(ASSET_LABELS[bucket], currentPct, idealRange),
    };
  });

  const equityRows = (Object.keys(EQUITY_LABELS) as EquityBucket[]).map((bucket) => {
    const currentPct = percent(equityTotals[bucket], equityTotal);
    const idealRange = ideal?.equity[bucket];
    return {
      key: bucket,
      label: EQUITY_LABELS[bucket],
      currentPct: round2(currentPct),
      idealRange,
      status: allocationStatus(currentPct, idealRange),
      recommendation: allocationRecommendation(EQUITY_LABELS[bucket], currentPct, idealRange),
    };
  });

  const sectorRows = STANDARD_SECTORS
    .map((sector) => {
      const value = sectorTotals[sector] ?? 0;
      const currentPct = percent(value, totalPortfolioValue);
      const max = ideal?.sector.max;
      let recommendation = 'Maintain a diversified review approach across sector exposure.';
      let status: AllocationRow['status'] = 'review';
      if (typeof max === 'number') {
        if (currentPct > max) {
          status = 'over';
          recommendation = `Sector concentration looks elevated versus the working ceiling of ${max}%. Consider reviewing this concentration.`;
        } else if (currentPct > 0 && currentPct < Math.max(5, max / 3)) {
          status = 'under';
          recommendation = 'Dedicated exposure is limited. Consider reviewing whether this is intentional within a diversified portfolio.';
        } else {
          status = 'ideal';
          recommendation = 'Current exposure does not appear concentrated relative to this risk profile.';
        }
      }
      return {
        key: sector.toLowerCase(),
        label: sector,
        currentPct: round2(currentPct),
        recommendation,
        status,
      };
    })
    .sort((a, b) => b.currentPct - a.currentPct);

  const amcConcentration = Object.entries(amcTotals)
    .map(([name, value]) => ({ name, pct: round2(percent(value, totalPortfolioValue)) }))
    .sort((a, b) => b.pct - a.pct)
    .filter((item) => item.pct >= 20);

  const schemeConcentration = Object.entries(schemeTotals)
    .map(([name, value]) => ({ name, pct: round2(percent(value, totalPortfolioValue)) }))
    .sort((a, b) => b.pct - a.pct)
    .filter((item) => item.pct >= 10);

  const alerts: string[] = [];
  if (holdings.length < 4) alerts.push('Portfolio appears under-diversified based on number of schemes.');
  if (holdings.length > 18) alerts.push('Portfolio appears over-diversified and may be harder to monitor.');
  if (amcConcentration.length > 0) alerts.push('One or more AMCs account for over 20% of portfolio value.');
  if (schemeConcentration.length > 0) alerts.push('One or more schemes account for over 10% of portfolio value.');
  if (holdings.some((holding) => holding.confidence === 'low')) {
    alerts.push('Some fund classifications are inferred with low confidence. Review manual mapping for accuracy.');
  }

  const insights: string[] = [];
  if (riskProfile) {
    assetRows.forEach((row) => {
      if (row.status === 'over' && row.idealRange) {
        insights.push(
          `Your ${row.label.toLowerCase()} allocation is ${row.currentPct}%, while the ideal range for your risk profile is ${row.idealRange.min}% to ${row.idealRange.max}%. Consider reviewing a ${round2(row.currentPct - row.idealRange.max)}% excess.`,
        );
      }
      if (row.status === 'under' && row.idealRange) {
        insights.push(
          `Your ${row.label.toLowerCase()} allocation is ${row.currentPct}%, while the ideal range for your risk profile is ${row.idealRange.min}% to ${row.idealRange.max}%. Consider reviewing a ${round2(row.idealRange.min - row.currentPct)}% gap.`,
        );
      }
    });

    equityRows.forEach((row) => {
      if (row.status === 'over' && row.idealRange) {
        insights.push(
          `Within equity, ${row.label.toLowerCase()} exposure is above the working range of ${row.idealRange.min}% to ${row.idealRange.max}%. Consider reviewing concentration here.`,
        );
      }
      if (row.status === 'under' && row.idealRange) {
        insights.push(
          `Within equity, ${row.label.toLowerCase()} exposure is below the working range of ${row.idealRange.min}% to ${row.idealRange.max}%. Consider reviewing whether broader diversification is needed.`,
        );
      }
    });
  }

  if (insights.length === 0) {
    insights.push('Current allocation appears broadly aligned with the available information. Continue reviewing diversification and concentration periodically.');
  }

  return {
    totalPortfolioValue: round2(totalPortfolioValue),
    totalInvestedAmount: round2(totalInvestedAmount),
    holdings,
    assetRows,
    equityRows,
    sectorRows,
    concentration: {
      totalSchemes: holdings.length,
      amcConcentration,
      schemeConcentration,
      alerts,
    },
    insights: insights.slice(0, 10),
    disclaimer: DEFAULT_DISCLAIMER,
    riskProfile,
  };
}
