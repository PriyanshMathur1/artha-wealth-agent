/**
 * Multi-agent orchestrator for the Ralph chat.
 *
 * Single entry point: `ralphRespond({ turns, userId })`. The orchestrator
 *   1. Routes the latest user turn to an intent.
 *   2. Dispatches the matching specialist agent(s) — in parallel where
 *      multiple sub-agents apply (the stock path runs all 6 agents in
 *      parallel; the compare path runs both sides in parallel).
 *   3. Synthesises a single response object the UI can render directly.
 *
 * Failure handling: every external-data agent is wrapped in try/catch so a
 * dead Angel One token / dead MFAPI / dead OpenAI key never 500s the chat.
 * The user gets a polite degraded answer and the route tells them what to
 * try next.
 */

import type { AgentFinding, RalphRequest, RalphResponse } from './types';
import { routeRalph } from './router';
import { runStockAgents } from './agents/stock';
import { runMFAgent } from './agents/mf';
import { runCompareAgent } from './agents/compare';
import { runPortfolioAgent } from './agents/portfolio';
import { runGeneralAnswerAgent } from './agents/general';
import { applyCompliance } from './compliance';

function asString(x: unknown, fallback = ''): string {
  return typeof x === 'string' && x.length > 0 ? x : fallback;
}

function asStringArray(x: unknown): string[] {
  return Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : [];
}

/**
 * Process a chat request end-to-end.
 *
 * Public entry point. ALL paths funnel through `applyCompliance` here —
 * adding a new return inside `ralphRespondInternal` is automatically
 * sanitised before reaching the user. See `lib/ralph/compliance.ts`.
 *
 * @param req `turns` is the full conversation; only the latest user message
 *            is routed. `userId` is required for the portfolio intent and
 *            optional everywhere else.
 * @returns A `RalphResponse` whose `meta.compliance` is populated.
 */
export async function ralphRespond(req: RalphRequest): Promise<RalphResponse> {
  const draft = await ralphRespondInternal(req);
  return applyCompliance(draft);
}

/**
 * Internal — produces an UNSANITISED draft response. Do not export.
 * Callers MUST go through `ralphRespond` so compliance is enforced.
 */
async function ralphRespondInternal(req: RalphRequest): Promise<RalphResponse> {
  const started = Date.now();
  const lastUser = [...req.turns].reverse().find((t) => t.role === 'user')?.content ?? '';
  const route = routeRalph(lastUser);

  // ── Stock ────────────────────────────────────────────────────────────
  if (route.intent === 'stock' && route.ticker) {
    try {
      const { findings, composite } = await runStockAgents(route.ticker);

      const fundamental = findings.find((f) => f.agent === 'Fundamental');
      const risk = findings.find((f) => f.agent === 'Risk');
      const why: string[] = [
        `Composite ${composite.score}/10 — weighted across fundamental (30%), moat (25%), technical (20%), growth (10%), risk (10%), sentiment (5%).`,
        fundamental?.evidence?.[0]
          ? `Fundamentals: ${fundamental.evidence[0]}`
          : 'Fundamentals scored but no headline strength surfaced.',
        risk?.evidence?.[0]
          ? `Risk: ${risk.evidence[0]}`
          : 'No top-line risks flagged.',
      ];

      const answer = [
        `**${route.ticker}** verdict: **${composite.verdict}** (${composite.score}/10).`,
        '',
        'Tell me your time horizon (months vs years) and risk tolerance, and I’ll translate this into entry / stop / sizing.',
      ].join('\n');

      return {
        answer,
        why,
        nextSteps: [
          `Open the deep dive: /stock/${route.ticker}`,
          'Share your time horizon + risk tolerance',
          'Add to watchlist?',
        ],
        agents: findings,
        meta: { intent: 'stock', ticker: route.ticker, latencyMs: Date.now() - started },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return {
        answer: `Couldn’t pull data for ${route.ticker}: ${message}.`,
        why: ['Upstream market-data call failed.'],
        nextSteps: ['Try again in a few seconds', 'Verify the ticker on /'],
        agents: [],
        meta: { intent: 'stock', ticker: route.ticker, latencyMs: Date.now() - started },
      };
    }
  }

  // ── Mutual fund ──────────────────────────────────────────────────────
  if (route.intent === 'mf' && route.mfQuery) {
    const res = await runMFAgent(route.mfQuery);

    const answer = res.schemeName
      ? `**${res.schemeName}** — ${res.finding.verdict ?? 'Reviewed'} (${(res.finding.score ?? 0).toFixed(1)}/10). ${res.finding.summary.split(' — ').slice(1).join(' — ')}`
      : res.finding.summary;

    return {
      answer,
      why: res.finding.evidence ?? [],
      nextSteps: res.schemeCode
        ? [
            'Compare against a category benchmark',
            'Add to portfolio (track SIP / lump-sum)',
            `Look up scheme code ${res.schemeCode} on AMFI`,
          ]
        : ['Try the exact AMFI scheme name', 'Or paste the 5-digit scheme code'],
      agents: [res.finding],
      meta: { intent: 'mf', schemeCode: res.schemeCode, latencyMs: Date.now() - started },
    };
  }

  // ── Compare ──────────────────────────────────────────────────────────
  if (route.intent === 'compare' && route.compare) {
    try {
      const cmp = await runCompareAgent(route.compare.left, route.compare.right, route.compare.kind);
      const why = cmp.finding.evidence ?? [];
      const agents: AgentFinding[] = [cmp.finding, ...cmp.perSide];
      return {
        answer: cmp.finding.summary,
        why,
        nextSteps: [
          `Deep dive on ${cmp.left}`,
          `Deep dive on ${cmp.right}`,
          'Tell me your investment horizon to translate this into action',
        ],
        agents,
        meta: {
          intent: 'compare',
          compareKind: route.compare.kind,
          compareLeft: cmp.left,
          compareRight: cmp.right,
          latencyMs: Date.now() - started,
        },
      };
    } catch (err) {
      return {
        answer: `Compare failed: ${err instanceof Error ? err.message : 'unknown error'}.`,
        why: [],
        agents: [],
        meta: { intent: 'compare', latencyMs: Date.now() - started },
      };
    }
  }

  // ── Portfolio ────────────────────────────────────────────────────────
  if (route.intent === 'portfolio') {
    if (!req.userId) {
      return {
        answer: 'Sign in to analyse your portfolio — I need your holdings to crunch P&L, sectors, and rebalance hints.',
        why: ['Portfolio analysis requires an authenticated user.'],
        nextSteps: ['Sign in', 'Then ask "How is my portfolio doing?" again'],
        agents: [],
        meta: { intent: 'portfolio', latencyMs: Date.now() - started },
      };
    }

    const portfolio = await runPortfolioAgent(req.userId);

    const answer = portfolio.summary +
      (portfolio.warnings && portfolio.warnings.length
        ? `\n\nWarnings:\n• ${portfolio.warnings.join('\n• ')}`
        : '');

    return {
      answer,
      why: portfolio.evidence ?? [],
      nextSteps: [
        'Run a full rebalance (/rebalance)',
        'Show me my biggest concentration risks',
        'How do my mutual funds compare to their benchmark?',
      ],
      agents: [portfolio],
      meta: { intent: 'portfolio', latencyMs: Date.now() - started },
    };
  }

  // ── General (LLM fallback) ───────────────────────────────────────────
  const general = await runGeneralAnswerAgent(req.turns);
  const data = (general.finding.data ?? {}) as Record<string, unknown>;

  return {
    answer: asString(data.answer, 'I can help with stocks, mutual funds, or your portfolio. Try "Analyze TCS" or "How is my portfolio doing?"'),
    why: asStringArray(data.why),
    assumptions: asStringArray(data.assumptions),
    nextSteps: asStringArray(data.nextSteps),
    agents: [general.finding],
    meta: { intent: 'general', latencyMs: Date.now() - started, tokenUsage: general.usage },
  };
}
