import * as z from 'zod';

export const WealthDocumentTypeSchema = z.enum([
  'portfolio_overview',
  'holding',
  'allocation_asset',
  'allocation_equity_subcategory',
  'sector_exposure',
  'amc_exposure',
  'scheme_exposure',
  'risk_profile',
  'assessment_insight',
  'knowledge_article',
  'compliance_policy',
]);

export const WealthIntentSchema = z.enum([
  'ingest_holdings',
  'allocation_summary',
  'ideal_allocation_review',
  'top_funds',
  'amc_concentration',
  'sector_exposure',
  'risk_profile',
  'education',
  'product_help',
  'unsupported',
]);

export const RetrievalModeSchema = z.enum([
  'structured_only',
  'structured_plus_vector',
  'vector_only',
]);

export const WealthDocumentSchema = z.object({
  id: z.string(),
  documentType: WealthDocumentTypeSchema,
  title: z.string(),
  content: z.string(),
  source: z.string(),
  asOf: z.string().optional(),
  userId: z.string().optional(),
  workspaceId: z.string().optional(),
  schemeName: z.string().optional(),
  amcName: z.string().optional(),
  assetBucket: z.string().optional(),
  equityBucket: z.string().optional(),
  sector: z.string().optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  tags: z.array(z.string()).default([]),
});

export const RetrievalPlanSchema = z.object({
  intent: WealthIntentSchema,
  mode: RetrievalModeSchema,
  structuredSources: z.array(WealthDocumentTypeSchema).default([]),
  vectorSources: z.array(WealthDocumentTypeSchema).default([]),
  includeAssessment: z.boolean().default(true),
  includeRiskProfile: z.boolean().default(true),
  includeCompliancePolicy: z.boolean().default(true),
});

export const WealthRagStateSchema = z.object({
  latestUserMessage: z.string(),
  intent: WealthIntentSchema.optional(),
  retrievalMode: RetrievalModeSchema.optional(),
  structuredContext: z.array(WealthDocumentSchema).default([]),
  vectorContext: z.array(WealthDocumentSchema).default([]),
  groundedFacts: z.array(z.string()).default([]),
  complianceNotes: z.array(z.string()).default([]),
});

export type WealthDocumentType = z.infer<typeof WealthDocumentTypeSchema>;
export type WealthIntent = z.infer<typeof WealthIntentSchema>;
export type RetrievalMode = z.infer<typeof RetrievalModeSchema>;
export type WealthDocument = z.infer<typeof WealthDocumentSchema>;
export type RetrievalPlan = z.infer<typeof RetrievalPlanSchema>;
export type WealthRagState = z.infer<typeof WealthRagStateSchema>;

export const DEFAULT_RETRIEVAL_PLANS: Record<WealthIntent, RetrievalPlan> = {
  ingest_holdings: {
    intent: 'ingest_holdings',
    mode: 'structured_only',
    structuredSources: ['holding', 'portfolio_overview'],
    vectorSources: [],
    includeAssessment: true,
    includeRiskProfile: false,
    includeCompliancePolicy: true,
  },
  allocation_summary: {
    intent: 'allocation_summary',
    mode: 'structured_only',
    structuredSources: ['portfolio_overview', 'allocation_asset', 'allocation_equity_subcategory'],
    vectorSources: [],
    includeAssessment: true,
    includeRiskProfile: true,
    includeCompliancePolicy: true,
  },
  ideal_allocation_review: {
    intent: 'ideal_allocation_review',
    mode: 'structured_plus_vector',
    structuredSources: ['portfolio_overview', 'allocation_asset', 'allocation_equity_subcategory', 'risk_profile', 'assessment_insight'],
    vectorSources: ['knowledge_article', 'compliance_policy'],
    includeAssessment: true,
    includeRiskProfile: true,
    includeCompliancePolicy: true,
  },
  top_funds: {
    intent: 'top_funds',
    mode: 'structured_only',
    structuredSources: ['scheme_exposure', 'holding', 'portfolio_overview'],
    vectorSources: [],
    includeAssessment: true,
    includeRiskProfile: false,
    includeCompliancePolicy: true,
  },
  amc_concentration: {
    intent: 'amc_concentration',
    mode: 'structured_only',
    structuredSources: ['amc_exposure', 'portfolio_overview', 'assessment_insight'],
    vectorSources: [],
    includeAssessment: true,
    includeRiskProfile: false,
    includeCompliancePolicy: true,
  },
  sector_exposure: {
    intent: 'sector_exposure',
    mode: 'structured_plus_vector',
    structuredSources: ['sector_exposure', 'portfolio_overview'],
    vectorSources: ['knowledge_article'],
    includeAssessment: true,
    includeRiskProfile: true,
    includeCompliancePolicy: true,
  },
  risk_profile: {
    intent: 'risk_profile',
    mode: 'structured_plus_vector',
    structuredSources: ['risk_profile', 'portfolio_overview', 'assessment_insight'],
    vectorSources: ['knowledge_article', 'compliance_policy'],
    includeAssessment: true,
    includeRiskProfile: true,
    includeCompliancePolicy: true,
  },
  education: {
    intent: 'education',
    mode: 'vector_only',
    structuredSources: [],
    vectorSources: ['knowledge_article', 'compliance_policy'],
    includeAssessment: false,
    includeRiskProfile: false,
    includeCompliancePolicy: true,
  },
  product_help: {
    intent: 'product_help',
    mode: 'vector_only',
    structuredSources: [],
    vectorSources: ['knowledge_article'],
    includeAssessment: false,
    includeRiskProfile: false,
    includeCompliancePolicy: true,
  },
  unsupported: {
    intent: 'unsupported',
    mode: 'structured_plus_vector',
    structuredSources: ['portfolio_overview', 'assessment_insight'],
    vectorSources: ['compliance_policy'],
    includeAssessment: true,
    includeRiskProfile: true,
    includeCompliancePolicy: true,
  },
};
