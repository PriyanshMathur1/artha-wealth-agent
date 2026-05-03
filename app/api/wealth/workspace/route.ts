import { NextRequest, NextResponse } from 'next/server';
import {
  clearLocalWealthWorkspace,
  getLocalWealthWorkspace,
  saveLocalWealthWorkspace,
} from '@/lib/local-wealth-store';
import { buildPortfolioAssessment, RISK_QUESTIONS, type NormalizedPortfolioHolding } from '@/lib/portfolio-assessment';
import { getUserIdOrDevFallback } from '@/lib/server-auth';
import { summarizeWorkspaceState } from '@/lib/wealth/rag';
import type { WealthMessage } from '@/lib/wealth/types';

export async function GET() {
  const userId = await getUserIdOrDevFallback();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspace = await getLocalWealthWorkspace(userId);
  if (!workspace) {
    return NextResponse.json({
      workspace: null,
      assessment: null,
    });
  }

  const assessment = workspace.holdings.length > 0
    ? buildPortfolioAssessment(
        workspace.holdings,
        Object.keys(workspace.riskAnswers).length === RISK_QUESTIONS.length ? workspace.riskAnswers : undefined,
      )
    : null;

  return NextResponse.json({
    workspace,
    assessment,
  });
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdOrDevFallback();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json()) as {
    messages?: WealthMessage[];
    holdings?: NormalizedPortfolioHolding[];
    riskAnswers?: Record<string, number>;
  };
  const messages = body.messages ?? [];
  const holdings = body.holdings ?? [];
  const riskAnswers = body.riskAnswers ?? {};
  const assessment = holdings.length > 0
    ? buildPortfolioAssessment(
        holdings,
        Object.keys(riskAnswers).length === RISK_QUESTIONS.length ? riskAnswers : undefined,
      )
    : null;
  const summary = summarizeWorkspaceState({ messages, holdings, riskAnswers, assessment });

  const workspace = await saveLocalWealthWorkspace(userId, {
    messages,
    holdings,
    riskAnswers,
    summary,
  });

  return NextResponse.json({ workspace, assessment });
}

export async function DELETE() {
  const userId = await getUserIdOrDevFallback();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await clearLocalWealthWorkspace(userId);
  return NextResponse.json({ ok: true });
}
