import type { NormalizedPortfolioHolding, PortfolioAssessment } from '@/lib/portfolio-assessment';

export type WealthRole = 'user' | 'assistant';
export type WealthConfidence = 'high' | 'medium' | 'low';

export interface WealthCitation {
  id: string;
  title: string;
  documentType: string;
  source: string;
  snippet: string;
}

export interface WealthMessage {
  id: string;
  role: WealthRole;
  content: string;
  createdAt: string;
  usedSources?: WealthCitation[];
  confidence?: WealthConfidence;
}

export interface WealthAssistantReply {
  answer: string;
  suggestions: string[];
  ingestionNote?: string;
  holdings?: NormalizedPortfolioHolding[];
  assessment?: PortfolioAssessment | null;
  usedSources?: WealthCitation[];
  confidence?: WealthConfidence;
  workspaceSummary?: string;
  intent?: string;
}
