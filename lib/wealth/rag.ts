import {
  ASSET_LABELS,
  buildPortfolioAssessment,
  RISK_QUESTIONS,
  scoreRiskProfile,
  type NormalizedPortfolioHolding,
  type PortfolioAssessment,
} from '@/lib/portfolio-assessment';
import { ARTHA_WEALTH_KNOWLEDGE } from './knowledge';
import {
  DEFAULT_RETRIEVAL_PLANS,
  type RetrievalMode,
  type RetrievalPlan,
  type WealthDocument,
  type WealthIntent,
} from './rag-schema';
import type { WealthCitation, WealthMessage } from './types';

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function vectorize(value: string): Map<string, number> {
  const vector = new Map<string, number>();
  for (const token of tokenize(value)) {
    vector.set(token, (vector.get(token) ?? 0) + 1);
  }
  return vector;
}

function cosineSimilarity(left: Map<string, number>, right: Map<string, number>): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (const value of left.values()) leftNorm += value * value;
  for (const value of right.values()) rightNorm += value * value;
  for (const [token, value] of left.entries()) {
    dot += value * (right.get(token) ?? 0);
  }

  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function docToCitation(document: WealthDocument): WealthCitation {
  return {
    id: document.id,
    title: document.title,
    documentType: document.documentType,
    source: document.source,
    snippet: document.content.slice(0, 180),
  };
}

function formatRiskProgress(riskAnswers: Record<string, number>): string {
  const answered = Object.keys(riskAnswers).length;
  if (answered === 0) return 'Risk questionnaire not started.';
  if (answered < RISK_QUESTIONS.length) return `Risk questionnaire in progress: ${answered}/${RISK_QUESTIONS.length} answered.`;
  const profile = scoreRiskProfile(riskAnswers);
  return `Risk questionnaire complete: ${profile.profile} (${profile.score}/100).`;
}

export function summarizeWorkspaceState(params: {
  messages: WealthMessage[];
  holdings: NormalizedPortfolioHolding[];
  riskAnswers: Record<string, number>;
  assessment: PortfolioAssessment | null;
}): string {
  const lastUserMessages = params.messages
    .filter((message) => message.role === 'user')
    .slice(-3)
    .map((message) => message.content.trim())
    .filter(Boolean);

  const summaryLines = [
    `Workspace has ${params.holdings.length} holding${params.holdings.length === 1 ? '' : 's'}.`,
    formatRiskProgress(params.riskAnswers),
  ];

  if (params.assessment) {
    summaryLines.push(`Portfolio value is ₹${params.assessment.totalPortfolioValue.toLocaleString('en-IN')}.`);
    summaryLines.push(`Largest current asset bucket is ${params.assessment.assetRows[0]?.label ?? 'unavailable'}.`);
  }
  if (lastUserMessages.length > 0) {
    summaryLines.push(`Recent user focus: ${lastUserMessages.join(' | ')}`);
  }

  return summaryLines.join(' ');
}

export function classifyWealthIntent(message: string): WealthIntent {
  const text = message.toLowerCase();

  if (/parag|hdfc|sbi|axis|fund|folio|amc|,\s*\d/.test(text) && /\d/.test(text)) return 'ingest_holdings';
  if (text.includes('top fund') || text.includes('largest fund') || text.includes('top holdings')) return 'top_funds';
  if (text.includes('amc')) return 'amc_concentration';
  if (text.includes('sector')) return 'sector_exposure';
  if (text.includes('ideal') || text.includes('over-allocated') || text.includes('under-allocated')) return 'ideal_allocation_review';
  if (text.includes('allocation') || text.includes('asset mix') || text.includes('summary')) return 'allocation_summary';
  if (text.includes('risk profile') || text.includes('questionnaire') || text.includes('aggressive') || text.includes('balanced')) return 'risk_profile';
  if (text.includes('upload') || text.includes('paste') || text.includes('how does this work')) return 'product_help';
  if (text.includes('what is') || text.includes('how should i think') || text.includes('why')) return 'education';
  return 'unsupported';
}

function buildKnowledgeDocuments(): WealthDocument[] {
  const articles = [
    {
      id: 'knowledge-core',
      title: 'Artha Wealth Portfolio Assessment Basics',
      source: 'internal-knowledge',
      content: ARTHA_WEALTH_KNOWLEDGE,
      documentType: 'knowledge_article' as const,
    },
    {
      id: 'knowledge-diversification',
      title: 'Diversification and Concentration Review',
      source: 'internal-knowledge',
      content:
        'Diversification review in Artha Wealth focuses on scheme concentration, AMC concentration, sector clustering, and balance across equity, debt, commodity, and international exposure. The tool should flag when a small number of schemes dominate the portfolio or when a user appears under-diversified or over-diversified.',
      documentType: 'knowledge_article' as const,
    },
    {
      id: 'knowledge-ideal-ranges',
      title: 'Ideal Allocation Range Guidance',
      source: 'internal-knowledge',
      content:
        'Ideal allocation ranges are educational reference bands unlocked through the risk profile. The system should compare current exposure with the relevant range and suggest review areas without giving direct buy or sell advice.',
      documentType: 'knowledge_article' as const,
    },
    {
      id: 'compliance-policy',
      title: 'Compliance Guardrails',
      source: 'internal-policy',
      content:
        'Use portfolio review language only. Say consider reviewing, may be over-allocated, may be under-diversified, and based on your risk profile. Never instruct the user to buy or sell a specific fund or promise returns.',
      documentType: 'compliance_policy' as const,
    },
  ];

  return articles.map((article) => ({
    ...article,
    asOf: new Date(0).toISOString(),
    tags: tokenize(article.title),
  }));
}

export function buildStructuredWealthDocuments(params: {
  holdings: NormalizedPortfolioHolding[];
  riskAnswers: Record<string, number>;
  assessment: PortfolioAssessment | null;
  summary?: string;
}): WealthDocument[] {
  const documents: WealthDocument[] = [];
  const { holdings, riskAnswers, assessment } = params;
  const riskComplete = Object.keys(riskAnswers).length === RISK_QUESTIONS.length;

  documents.push({
    id: 'portfolio-overview',
    documentType: 'portfolio_overview',
    title: 'Portfolio Overview',
    content: assessment
      ? [
          `Portfolio value ₹${assessment.totalPortfolioValue.toLocaleString('en-IN')}.`,
          `Invested amount ₹${assessment.totalInvestedAmount.toLocaleString('en-IN')}.`,
          `Total schemes ${assessment.holdings.length}.`,
          params.summary ?? '',
        ]
          .filter(Boolean)
          .join(' ')
      : `Portfolio workspace currently has ${holdings.length} holdings. ${params.summary ?? ''}`.trim(),
    source: 'portfolio-workspace',
    asOf: new Date().toISOString(),
    tags: ['portfolio', 'overview'],
  });

  for (const holding of holdings) {
    documents.push({
      id: `holding-${holding.id}`,
      documentType: 'holding',
      title: holding.schemeName,
      content: [
        `${holding.schemeName} from ${holding.amcName || 'Unknown AMC'}.`,
        `Current value ₹${holding.currentValue.toLocaleString('en-IN')}.`,
        `Invested amount ₹${holding.investedAmount.toLocaleString('en-IN')}.`,
        `Asset bucket ${holding.inferredAssetBucket}.`,
        holding.inferredEquityBucket ? `Equity bucket ${holding.inferredEquityBucket}.` : '',
        `Sector ${holding.inferredSector}.`,
      ]
        .filter(Boolean)
        .join(' '),
      source: 'portfolio-holding',
      asOf: new Date().toISOString(),
      schemeName: holding.schemeName,
      amcName: holding.amcName,
      assetBucket: holding.inferredAssetBucket,
      equityBucket: holding.inferredEquityBucket,
      sector: holding.inferredSector,
      confidence: holding.confidence,
      tags: tokenize(`${holding.schemeName} ${holding.amcName} ${holding.category ?? ''}`),
    });
  }

  if (assessment) {
    for (const row of assessment.assetRows) {
      documents.push({
        id: `asset-${row.key}`,
        documentType: 'allocation_asset',
        title: `${row.label} Allocation`,
        content: [
          `${row.label} current allocation is ${row.currentPct}%.`,
          row.idealRange ? `Ideal range is ${row.idealRange.min}% to ${row.idealRange.max}%.` : 'Ideal range is locked.',
          row.recommendation,
        ].join(' '),
        source: 'portfolio-assessment',
        asOf: new Date().toISOString(),
        assetBucket: row.key,
        tags: tokenize(`${row.label} allocation`),
      });
    }

    for (const row of assessment.equityRows) {
      documents.push({
        id: `equity-${row.key}`,
        documentType: 'allocation_equity_subcategory',
        title: `${row.label} Equity Exposure`,
        content: [
          `${row.label} current allocation within equity is ${row.currentPct}%.`,
          row.idealRange ? `Ideal range is ${row.idealRange.min}% to ${row.idealRange.max}%.` : 'Ideal range is locked.',
          row.recommendation,
        ].join(' '),
        source: 'portfolio-assessment',
        asOf: new Date().toISOString(),
        equityBucket: row.key,
        tags: tokenize(`${row.label} equity`),
      });
    }

    for (const row of assessment.sectorRows) {
      documents.push({
        id: `sector-${row.key}`,
        documentType: 'sector_exposure',
        title: `${row.label} Sector Exposure`,
        content: `${row.label} exposure is ${row.currentPct}% of portfolio value. ${row.recommendation}`,
        source: 'portfolio-assessment',
        asOf: new Date().toISOString(),
        sector: row.label,
        tags: tokenize(`${row.label} sector`),
      });
    }

    for (const item of assessment.concentration.amcConcentration) {
      documents.push({
        id: `amc-${item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        documentType: 'amc_exposure',
        title: `${item.name} AMC Concentration`,
        content: `${item.name} represents ${item.pct}% of current portfolio value.`,
        source: 'portfolio-assessment',
        asOf: new Date().toISOString(),
        amcName: item.name,
        tags: tokenize(`${item.name} amc concentration`),
      });
    }

    for (const item of assessment.concentration.schemeConcentration) {
      documents.push({
        id: `scheme-${item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        documentType: 'scheme_exposure',
        title: `${item.name} Scheme Concentration`,
        content: `${item.name} represents ${item.pct}% of current portfolio value.`,
        source: 'portfolio-assessment',
        asOf: new Date().toISOString(),
        schemeName: item.name,
        tags: tokenize(`${item.name} scheme concentration`),
      });
    }

    for (let index = 0; index < assessment.insights.length; index += 1) {
      documents.push({
        id: `insight-${index + 1}`,
        documentType: 'assessment_insight',
        title: `Assessment Insight ${index + 1}`,
        content: assessment.insights[index],
        source: 'portfolio-assessment',
        asOf: new Date().toISOString(),
        tags: tokenize(assessment.insights[index]),
      });
    }
  }

  documents.push({
    id: 'risk-profile',
    documentType: 'risk_profile',
    title: 'Risk Profile Status',
    content: riskComplete
      ? (() => {
          const profile = scoreRiskProfile(riskAnswers);
          return `Risk profile is ${profile.profile} with score ${profile.score}/100.`;
        })()
      : `Risk profile is incomplete with ${Object.keys(riskAnswers).length}/${RISK_QUESTIONS.length} questions answered.`,
    source: 'risk-questionnaire',
    asOf: new Date().toISOString(),
    tags: ['risk', 'profile'],
  });

  return documents;
}

function retrieveDocuments(query: string, documents: WealthDocument[], limit: number): WealthDocument[] {
  const queryVector = vectorize(query);
  return documents
    .map((document) => {
      const text = `${document.title}\n${document.content}\n${document.tags.join(' ')}`;
      const score = cosineSimilarity(queryVector, vectorize(text));
      const keywordBoost = tokenize(query).some((token) => document.title.toLowerCase().includes(token)) ? 0.12 : 0;
      return { document, score: score + keywordBoost };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((item) => item.document);
}

export function buildRetrievalContext(params: {
  latestUserMessage: string;
  holdings: NormalizedPortfolioHolding[];
  riskAnswers: Record<string, number>;
  assessment: PortfolioAssessment | null;
  workspaceSummary?: string;
}): {
  intent: WealthIntent;
  plan: RetrievalPlan;
  structuredDocs: WealthDocument[];
  vectorDocs: WealthDocument[];
  usedSources: WealthCitation[];
} {
  const intent = classifyWealthIntent(params.latestUserMessage);
  const plan = DEFAULT_RETRIEVAL_PLANS[intent];
  const structuredDocs = buildStructuredWealthDocuments({
    holdings: params.holdings,
    riskAnswers: params.riskAnswers,
    assessment: params.assessment,
    summary: params.workspaceSummary,
  });
  const vectorPool = [...structuredDocs, ...buildKnowledgeDocuments()];

  const selectedStructured = retrieveDocuments(params.latestUserMessage, structuredDocs, plan.mode === 'structured_only' ? 6 : 4)
    .filter((doc) => plan.structuredSources.length === 0 || plan.structuredSources.includes(doc.documentType));
  const selectedVector = plan.mode === 'vector_only' || plan.mode === 'structured_plus_vector'
    ? retrieveDocuments(params.latestUserMessage, vectorPool, 4)
        .filter((doc) => plan.vectorSources.length === 0 || plan.vectorSources.includes(doc.documentType))
    : [];

  const usedSources = [...selectedStructured, ...selectedVector]
    .slice(0, 6)
    .map(docToCitation);

  return {
    intent,
    plan,
    structuredDocs: selectedStructured,
    vectorDocs: selectedVector,
    usedSources,
  };
}

function withDisclaimer(answer: string): string {
  const disclaimer =
    'This assessment is based on the information provided by you and publicly available mutual fund data. It is for educational and portfolio review purposes only and should not be considered investment advice.';
  return answer.includes(disclaimer) ? answer : `${answer}\n\n${disclaimer}`;
}

export function buildDeterministicWealthAnswer(params: {
  latestUserMessage: string;
  intent: WealthIntent;
  holdings: NormalizedPortfolioHolding[];
  riskAnswers: Record<string, number>;
  assessment: PortfolioAssessment | null;
  usedSources: WealthCitation[];
  ingestionNote?: string;
}): {
  answer: string;
  suggestions: string[];
  confidence: 'high' | 'medium' | 'low';
} | null {
  const { intent, assessment, holdings } = params;
  if (holdings.length === 0) {
    return {
      answer: withDisclaimer(
        [
          params.ingestionNote,
          'Artha Wealth is ready, but I need your holdings first.',
          'Paste a few portfolio lines in chat or upload an Excel or CSV file and I will turn that into a portfolio workspace.',
        ]
          .filter(Boolean)
          .join('\n\n'),
      ),
      suggestions: ['Paste my holdings', 'Upload portfolio file', 'How does this work?'],
      confidence: 'high',
    };
  }
  if (!assessment) return null;

  if (intent === 'top_funds') {
    const answer = [
      'Your largest scheme exposures right now are:',
      ...assessment.concentration.schemeConcentration.slice(0, 5).map(
        (scheme, index) => `${index + 1}. ${scheme.name} at ${scheme.pct}% of portfolio value`,
      ),
    ].join('\n');
    return {
      answer: withDisclaimer([params.ingestionNote, answer].filter(Boolean).join('\n\n')),
      suggestions: ['Show AMC concentration', 'Summarize current allocation', 'What should I review first?'],
      confidence: 'high',
    };
  }

  if (intent === 'amc_concentration') {
    const lines = assessment.concentration.amcConcentration.length > 0
      ? assessment.concentration.amcConcentration.map((item, index) => `${index + 1}. ${item.name} at ${item.pct}%`)
      : ['No AMC is currently above the 20% concentration review threshold.'];
    return {
      answer: withDisclaimer(['Here is your current AMC concentration view:', ...lines].join('\n')),
      suggestions: ['What are my top funds?', 'Show concentration review', 'Summarize current allocation'],
      confidence: 'high',
    };
  }

  if (intent === 'allocation_summary' || intent === 'ideal_allocation_review') {
    const lines = assessment.assetRows.map((row) => {
      const range = row.idealRange ? `${row.idealRange.min}% to ${row.idealRange.max}%` : 'locked';
      return `• ${ASSET_LABELS[row.key as keyof typeof ASSET_LABELS]}: ${row.currentPct}% now | ideal ${range} | ${row.status}`;
    });
    return {
      answer: withDisclaimer(
        [
          params.ingestionNote,
          'Here is your current portfolio assessment snapshot:',
          ...lines,
          assessment.riskProfile
            ? `Your current risk profile is ${assessment.riskProfile.profile}.`
            : 'Complete the risk profile to unlock ideal allocation ranges.',
        ]
          .filter(Boolean)
          .join('\n'),
      ),
      suggestions: ['Where am I over-allocated?', 'Complete risk profile', 'Show concentration review'],
      confidence: assessment.riskProfile ? 'high' : 'medium',
    };
  }

  if (intent === 'sector_exposure') {
    return {
      answer: withDisclaimer(
        [
          'Here is your sector exposure view:',
          ...assessment.sectorRows.slice(0, 6).map((row) => `• ${row.label}: ${row.currentPct}% | ${row.status}`),
        ].join('\n'),
      ),
      suggestions: ['Show concentration review', 'Summarize current allocation', 'How should I think about diversification?'],
      confidence: 'medium',
    };
  }

  if (intent === 'risk_profile') {
    const answered = Object.keys(params.riskAnswers).length;
    if (!assessment.riskProfile) {
      const nextQuestion = RISK_QUESTIONS.find((question) => params.riskAnswers[question.id] == null);
      return {
        answer: withDisclaimer(
          `Your risk profile is not complete yet. You have answered ${answered}/${RISK_QUESTIONS.length} questions.${nextQuestion ? ` Next prompt: ${nextQuestion.label}` : ''}`,
        ),
        suggestions: ['Complete risk profile', 'Why does risk profile matter?', 'Summarize current allocation'],
        confidence: 'high',
      };
    }
    return {
      answer: withDisclaimer(
        `Your current risk profile is ${assessment.riskProfile.profile} with a score of ${assessment.riskProfile.score}/100. I can now compare your current allocation against ideal educational ranges for that profile.`,
      ),
      suggestions: ['Show my ideal allocation review', 'Where am I over-allocated?', 'Explain my profile'],
      confidence: 'high',
    };
  }

  if (intent === 'unsupported') {
    const alerts = assessment.concentration.alerts.length > 0
      ? assessment.concentration.alerts.map((alert) => `• ${alert}`)
      : ['• No major concentration alerts detected from current data.'];
    return {
      answer: withDisclaimer(
        [
          'Here are the main portfolio review points I can support right now:',
          ...alerts,
          ...assessment.insights.slice(0, 3).map((insight) => `• ${insight}`),
        ].join('\n'),
      ),
      suggestions: ['What are my top funds?', 'Summarize current allocation', 'Complete risk profile'],
      confidence: 'medium',
    };
  }

  return null;
}

export function buildModelPrompt(params: {
  latestUserMessage: string;
  intent: WealthIntent;
  assessment: PortfolioAssessment | null;
  structuredDocs: WealthDocument[];
  vectorDocs: WealthDocument[];
  workspaceSummary?: string;
}): string {
  return [
    `Intent: ${params.intent}`,
    `User question: ${params.latestUserMessage}`,
    params.workspaceSummary ? `Workspace summary: ${params.workspaceSummary}` : '',
    params.assessment?.riskProfile ? `Risk profile: ${params.assessment.riskProfile.profile}` : 'Risk profile: incomplete',
    '',
    'Structured context:',
    ...params.structuredDocs.map((doc) => `- [${doc.documentType}] ${doc.title}: ${doc.content}`),
    '',
    'Retrieved knowledge context:',
    ...params.vectorDocs.map((doc) => `- [${doc.documentType}] ${doc.title}: ${doc.content}`),
  ]
    .filter(Boolean)
    .join('\n');
}
