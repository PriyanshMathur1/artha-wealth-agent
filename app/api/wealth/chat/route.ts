import { NextRequest, NextResponse } from 'next/server';
import {
  buildPortfolioAssessment,
  enrichHoldingClassification,
  RISK_QUESTIONS,
  type NormalizedPortfolioHolding,
} from '@/lib/portfolio-assessment';
import { saveLocalWealthWorkspace } from '@/lib/local-wealth-store';
import { getUserIdOrDevFallback } from '@/lib/server-auth';
import { generateArthaWealthReply } from '@/lib/wealth/assistant';
import { summarizeWorkspaceState } from '@/lib/wealth/rag';
import { mergeHoldings, parsePortfolioText } from '@/lib/wealth/parser';
import type { WealthMessage } from '@/lib/wealth/types';

function normalizeHoldings(holdings: NormalizedPortfolioHolding[]): NormalizedPortfolioHolding[] {
  return holdings.map((holding, index) => {
    if (holding.assetBreakdown && holding.inferredAssetBucket && holding.inferredSector) {
      return holding;
    }

    const classification = enrichHoldingClassification({
      schemeName: holding.schemeName,
      amcName: holding.amcName ?? '',
      assetClass: holding.assetClass,
      category: holding.category,
      metadata: holding.metadata,
    });

    return {
      id: holding.id ?? `wealth-${index}-${holding.schemeName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
      schemeName: holding.schemeName,
      schemeCode: holding.schemeCode,
      amcName: holding.amcName ?? '',
      folioNumber: holding.folioNumber,
      units: Number.isFinite(holding.units) ? holding.units : 0,
      investedAmount: Number.isFinite(holding.investedAmount) ? holding.investedAmount : 0,
      currentValue: Number.isFinite(holding.currentValue) ? holding.currentValue : 0,
      currentNav: Number.isFinite(holding.currentNav) ? holding.currentNav : undefined,
      assetClass: holding.assetClass,
      category: holding.category,
      metadata: holding.metadata,
      inferredAssetBucket: classification.inferredAssetBucket,
      inferredEquityBucket: classification.inferredEquityBucket,
      inferredSector: classification.inferredSector,
      assetBreakdown: classification.assetBreakdown,
      confidence: holding.confidence ?? classification.confidence,
      inferenceSource: holding.inferenceSource?.length ? holding.inferenceSource : classification.inferenceSource,
      suggestionOptions: holding.suggestionOptions ?? [],
    };
  });
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdOrDevFallback();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as {
      messages?: WealthMessage[];
      holdings?: NormalizedPortfolioHolding[];
      riskAnswers?: Record<string, number>;
    };

    const messages = body.messages ?? [];
    const holdings = body.holdings ?? [];
    const riskAnswers = body.riskAnswers ?? {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages required' }, { status: 400 });
    }

    const latestUser = [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';
    const parsedHoldings = parsePortfolioText(latestUser);
    const normalizedIncomingHoldings = normalizeHoldings(holdings);
    const mergedHoldings = parsedHoldings.length > 0
      ? mergeHoldings(normalizedIncomingHoldings, parsedHoldings)
      : normalizedIncomingHoldings;
    const ingestionNote = parsedHoldings.length > 0
      ? `I parsed ${parsedHoldings.length} holding${parsedHoldings.length > 1 ? 's' : ''} from your chat message and added them to your portfolio workspace.`
      : undefined;

    const reply = await generateArthaWealthReply({
      messages,
      holdings: mergedHoldings,
      riskAnswers,
      ingestionNote,
    });
    const assessment = mergedHoldings.length > 0
      ? buildPortfolioAssessment(
          mergedHoldings,
          Object.keys(riskAnswers).length === RISK_QUESTIONS.length ? riskAnswers : undefined,
        )
      : null;

    const assistantMessage: WealthMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      createdAt: new Date().toISOString(),
      content: reply.answer,
      usedSources: reply.usedSources,
      confidence: reply.confidence,
    };

    const allMessages = [...messages, assistantMessage];
    const workspaceSummary = summarizeWorkspaceState({
      messages: allMessages,
      holdings: mergedHoldings,
      riskAnswers,
      assessment,
    });

    await saveLocalWealthWorkspace(userId, {
      messages: allMessages,
      holdings: mergedHoldings,
      riskAnswers,
      summary: workspaceSummary,
    });

    return NextResponse.json({
      ...reply,
      holdings: parsedHoldings.length > 0 ? mergedHoldings : undefined,
      assessment,
      workspaceSummary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Artha Wealth failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
