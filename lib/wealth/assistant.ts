import { END, START, StateGraph, StateSchema } from '@langchain/langgraph';
import * as z from 'zod';
import { getPreferredChatModel, openAIChat } from '@/lib/llm/openai';
import {
  buildPortfolioAssessment,
  RISK_QUESTIONS,
  type NormalizedPortfolioHolding,
  type PortfolioAssessment,
} from '@/lib/portfolio-assessment';
import { ARTHA_WEALTH_KNOWLEDGE } from './knowledge';
import {
  buildDeterministicWealthAnswer,
  buildModelPrompt,
  buildRetrievalContext,
  summarizeWorkspaceState,
} from './rag';
import type { WealthAssistantReply, WealthCitation, WealthMessage } from './types';

const WealthState = new StateSchema({
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(['user', 'assistant']),
      content: z.string(),
      createdAt: z.string(),
      usedSources: z.array(z.any()).optional(),
      confidence: z.enum(['high', 'medium', 'low']).optional(),
    }),
  ),
  holdings: z.array(z.any()),
  riskAnswers: z.record(z.string(), z.number()),
  ingestionNote: z.string().optional(),
  assessment: z.any().nullable().optional(),
  workspaceSummary: z.string().optional(),
  structuredDocs: z.array(z.any()).optional(),
  vectorDocs: z.array(z.any()).optional(),
  intent: z.string().optional(),
  answer: z.string().optional(),
  suggestions: z.array(z.string()).optional(),
  usedSources: z.array(z.any()).optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
});

const ingestNode = async (state: {
  messages: WealthMessage[];
  holdings: NormalizedPortfolioHolding[];
  riskAnswers: Record<string, number>;
}) => {
  const completeRiskProfile = Object.keys(state.riskAnswers).length === RISK_QUESTIONS.length;
  const assessment = state.holdings.length
    ? buildPortfolioAssessment(state.holdings, completeRiskProfile ? state.riskAnswers : undefined)
    : null;
  const workspaceSummary = summarizeWorkspaceState({
    messages: state.messages,
    holdings: state.holdings,
    riskAnswers: state.riskAnswers,
    assessment,
  });

  return { assessment, workspaceSummary };
};

const retrievalNode = async (state: {
  messages: WealthMessage[];
  holdings: NormalizedPortfolioHolding[];
  riskAnswers: Record<string, number>;
  assessment?: PortfolioAssessment | null;
  workspaceSummary?: string;
}) => {
  const latestUserMessage = [...state.messages].reverse().find((message) => message.role === 'user')?.content ?? '';
  const retrieval = buildRetrievalContext({
    latestUserMessage,
    holdings: state.holdings,
    riskAnswers: state.riskAnswers,
    assessment: (state.assessment ?? null) as PortfolioAssessment | null,
    workspaceSummary: state.workspaceSummary,
  });

  return {
    intent: retrieval.intent,
    structuredDocs: retrieval.structuredDocs,
    vectorDocs: retrieval.vectorDocs,
    usedSources: retrieval.usedSources,
  };
};

const respondNode = async (state: {
  messages: WealthMessage[];
  holdings: NormalizedPortfolioHolding[];
  riskAnswers: Record<string, number>;
  ingestionNote?: string;
  assessment?: PortfolioAssessment | null;
  workspaceSummary?: string;
  structuredDocs?: Array<{ title: string; content: string }>;
  vectorDocs?: Array<{ title: string; content: string }>;
  intent?: string;
  usedSources?: WealthCitation[];
}) => {
  const latestUserMessage = [...state.messages].reverse().find((message) => message.role === 'user')?.content ?? '';
  const assessment = (state.assessment ?? null) as PortfolioAssessment | null;
  const intent = (state.intent ?? 'unsupported') as any;

  const deterministic = buildDeterministicWealthAnswer({
    latestUserMessage,
    intent,
    holdings: state.holdings,
    riskAnswers: state.riskAnswers,
    assessment,
    usedSources: state.usedSources ?? [],
    ingestionNote: state.ingestionNote,
  });

  if (deterministic) {
    return {
      answer: deterministic.answer,
      suggestions: deterministic.suggestions,
      confidence: deterministic.confidence,
      usedSources: state.usedSources ?? [],
    };
  }

  try {
    const model = getPreferredChatModel();
    const system = [
      'You are Artha Wealth, an AI-powered portfolio copilot for Indian mutual fund investors.',
      'Use only the supplied grounded context and compliance-safe language.',
      ARTHA_WEALTH_KNOWLEDGE,
      'Never tell the user to buy or sell a specific fund.',
      'If ideal ranges are not unlocked, say so clearly.',
      'Return only valid JSON: {"answer": string, "suggestions": string[], "confidence": "high"|"medium"|"low"}.',
    ].join('\n');

    const prompt = buildModelPrompt({
      latestUserMessage,
      intent,
      assessment,
      structuredDocs: (state.structuredDocs ?? []) as any,
      vectorDocs: (state.vectorDocs ?? []) as any,
      workspaceSummary: state.workspaceSummary,
    });

    const result = await openAIChat({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      maxTokens: 850,
    });

    const parsed = JSON.parse(result.text) as { answer?: string; suggestions?: string[]; confidence?: 'high' | 'medium' | 'low' };
    return {
      answer: parsed.answer ?? 'I can help review your portfolio once I have a clearer question or more portfolio context.',
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 4) : ['Summarize current allocation', 'Show concentration review'],
      confidence: parsed.confidence ?? 'medium',
      usedSources: state.usedSources ?? [],
    };
  } catch {
    const fallback = buildDeterministicWealthAnswer({
      latestUserMessage,
      intent: 'unsupported',
      holdings: state.holdings,
      riskAnswers: state.riskAnswers,
      assessment,
      usedSources: state.usedSources ?? [],
      ingestionNote: state.ingestionNote,
    });
    return {
      answer: fallback?.answer ?? 'Artha Wealth hit a temporary issue while grounding that answer.',
      suggestions: fallback?.suggestions ?? ['Summarize current allocation', 'What are my top funds?'],
      confidence: fallback?.confidence ?? 'low',
      usedSources: state.usedSources ?? [],
    };
  }
};

const wealthGraph = new StateGraph(WealthState)
  .addNode('ingest', ingestNode)
  .addNode('retrieve', retrievalNode)
  .addNode('respond', respondNode)
  .addEdge(START, 'ingest')
  .addEdge('ingest', 'retrieve')
  .addEdge('retrieve', 'respond')
  .addEdge('respond', END)
  .compile();

export async function generateArthaWealthReply(params: {
  messages: WealthMessage[];
  holdings: NormalizedPortfolioHolding[];
  riskAnswers: Record<string, number>;
  ingestionNote?: string;
}): Promise<WealthAssistantReply> {
  const result = await wealthGraph.invoke({
    messages: params.messages,
    holdings: params.holdings,
    riskAnswers: params.riskAnswers,
    ingestionNote: params.ingestionNote,
  });

  return {
    answer: result.answer ?? '',
    suggestions: Array.isArray(result.suggestions) ? result.suggestions : [],
    ingestionNote: params.ingestionNote,
    assessment: (result.assessment ?? null) as PortfolioAssessment | null,
    usedSources: Array.isArray(result.usedSources) ? (result.usedSources as WealthCitation[]) : [],
    confidence: result.confidence ?? 'medium',
    workspaceSummary: result.workspaceSummary,
    intent: typeof result.intent === 'string' ? result.intent : undefined,
  };
}
