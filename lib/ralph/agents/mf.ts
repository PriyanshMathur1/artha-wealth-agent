/**
 * Mutual fund specialist for Ralph.
 *
 * Resolves a fuzzy scheme name or numeric scheme code to a single fund,
 * pulls latest NAV + trailing returns + 3-month direction from MFAPI, and
 * scores it on a 0–10 scale anchored to 1Y return.
 *
 * Resolver bias: prefers Direct + Growth plans, demotes IDCW/dividend variants
 * (which MFAPI exposes as separate scheme codes for the same fund family).
 */

import {
  searchMFSchemes,
  getMFDetail,
  getMFTrailingReturns,
  getMFDirection,
  getCurrentNav,
  type MFScheme,
} from '@/lib/mfapi';

import type { AgentFinding } from '../types';

export interface MFAgentResult {
  finding: AgentFinding;
  schemeCode?: string;
  schemeName?: string;
}

/**
 * Resolve a scheme: accept either a numeric scheme code or a fuzzy name.
 * Picks the best match by shortest name length to bias toward the parent
 * "Direct Growth" plan over the dozen-variant clutter MFAPI exposes.
 */
async function resolveScheme(query: string): Promise<MFScheme | null> {
  const q = query.trim();
  if (/^\d{4,7}$/.test(q)) {
    try {
      const detail = await getMFDetail(q);
      return {
        schemeCode: String(detail.meta.scheme_code),
        schemeName: detail.meta.scheme_name,
        amcName: detail.meta.fund_house,
      };
    } catch {
      return null;
    }
  }

  let matches;
  try {
    matches = await searchMFSchemes(q, 30);
  } catch (error) {
    return null;
  }
  if (!matches.length) return null;

  // Prefer "Direct" + "Growth" plans, then shortest scheme name.
  const ranked = matches.slice().sort((a, b) => {
    const score = (s: MFScheme) => {
      const n = s.schemeName.toLowerCase();
      let pts = 0;
      if (n.includes('direct')) pts -= 2;
      if (n.includes('growth')) pts -= 2;
      if (n.includes('idcw') || n.includes('dividend')) pts += 3;
      if (n.includes('regular')) pts += 1;
      return pts + n.length / 100;
    };
    return score(a) - score(b);
  });
  return ranked[0];
}

function gradeFromReturn(oneYr: number | null): { score: number; verdict: string } {
  if (oneYr === null) return { score: 5, verdict: 'Insufficient data' };
  if (oneYr >= 25) return { score: 8.5, verdict: 'Strong performer' };
  if (oneYr >= 15) return { score: 7.5, verdict: 'Buy' };
  if (oneYr >= 8) return { score: 6.0, verdict: 'Hold' };
  if (oneYr >= 0) return { score: 4.5, verdict: 'Watch' };
  return { score: 3.0, verdict: 'Caution' };
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

/**
 * Resolve and score a single mutual fund.
 * @param query Either an AMFI scheme code (4–7 digits) or a fuzzy scheme name
 *              like "Parag Parikh Flexi Cap" or "PPFAS Flexi Cap Direct Growth".
 * @returns A finding the orchestrator turns into the chat answer + card.
 */
export async function runMFAgent(query: string): Promise<MFAgentResult> {
  const scheme = await resolveScheme(query);
  if (!scheme) {
    return {
      finding: {
        agent: 'Mutual Fund',
        summary: `No mutual fund found matching "${query}".`,
        evidence: ['Try the exact AMFI scheme name or a 5-digit scheme code.'],
      },
    };
  }

  const code = scheme.schemeCode;

  const [navRes, trailingRes, directionRes, detailRes] = await Promise.allSettled([
    getCurrentNav(code),
    getMFTrailingReturns(code),
    getMFDirection(code),
    getMFDetail(code),
  ]);

  const nav = navRes.status === 'fulfilled' ? navRes.value : null;
  const trailing = trailingRes.status === 'fulfilled' ? trailingRes.value : null;
  const direction = directionRes.status === 'fulfilled' ? directionRes.value : null;
  const detail = detailRes.status === 'fulfilled' ? detailRes.value : null;

  const oneYr = trailing?.['1Y'] ?? null;
  const { score, verdict } = gradeFromReturn(oneYr);

  const evidence: string[] = [];
  const warnings: string[] = [];

  if (nav !== null) evidence.push(`Latest NAV: ₹${nav.toFixed(2)}`);
  if (trailing) {
    evidence.push(
      `Trailing returns — 1M ${fmtPct(trailing['1M'])}, 3M ${fmtPct(trailing['3M'])}, ` +
        `6M ${fmtPct(trailing['6M'])}, 1Y ${fmtPct(trailing['1Y'])}`,
    );
  }
  if (direction) {
    evidence.push(
      `3-month direction: ${direction.status} (${fmtPct(direction.trailing3M)})`,
    );
    if (direction.consecutiveUnderperformMonths >= 3) {
      warnings.push(
        `Underperformed for ${direction.consecutiveUnderperformMonths} consecutive months — review against category benchmark.`,
      );
    }
  }
  if (detail?.meta.scheme_category) {
    evidence.push(`Category: ${detail.meta.scheme_category}`);
  }
  if (detail?.meta.fund_house) {
    evidence.push(`AMC: ${detail.meta.fund_house}`);
  }

  if (oneYr !== null && oneYr < 5 && (trailing?.['3M'] ?? 0) < 0) {
    warnings.push('Both 3M and 1Y returns are weak — verify the fund still fits your goal.');
  }

  const summary = `${scheme.schemeName} — ${verdict} (score ${score.toFixed(1)}/10). ` +
    `1Y return ${fmtPct(oneYr)}.`;

  return {
    schemeCode: code,
    schemeName: scheme.schemeName,
    finding: {
      agent: 'Mutual Fund',
      summary,
      score,
      verdict,
      evidence,
      warnings,
      data: {
        schemeCode: code,
        schemeName: scheme.schemeName,
        nav,
        trailing,
        direction,
        meta: detail?.meta ?? null,
      },
    },
  };
}
