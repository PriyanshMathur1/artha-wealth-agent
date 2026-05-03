/**
 * Eval judge — scores a `RalphResponse` against a fixture.
 *
 * Two layers:
 *   1. Deterministic checks (always run): `mustContain`, `mustNotContain`,
 *      `shapeChecks` (e.g. "agents has length >= 1", "intent === 'stock'").
 *   2. LLM-as-judge (optional): a small model rates the answer against the
 *      fixture's freeform `rubric`. Off when `--no-llm` is passed.
 *
 * Why we keep deterministic checks primary
 * ----------------------------------------
 * LLM judges have variance. The regression gate in `evals/run.ts` triggers
 * on a 5pp drop in pass-rate; that gate is meaningless if the judge itself
 * fluctuates by 10pp run-to-run. Deterministic assertions are the floor;
 * LLM scoring is a tiebreaker.
 */

import type { RalphResponse } from '@/lib/ralph/types';
import type { Fixture, JudgeResult } from './types';

export async function judge(
  response: RalphResponse,
  fixture: Fixture,
  opts: { useLLM?: boolean } = {},
): Promise<JudgeResult> {
  const failures: string[] = [];

  // ── 1. Intent assertion ────────────────────────────────────────────
  if (fixture.intent && response.meta.intent !== fixture.intent) {
    failures.push(
      `intent mismatch: expected ${fixture.intent}, got ${response.meta.intent}`,
    );
  }

  // ── 2. mustContain ─────────────────────────────────────────────────
  const haystack = buildHaystack(response);
  for (const phrase of fixture.mustContain ?? []) {
    if (!haystack.includes(phrase)) {
      failures.push(`missing required phrase: "${phrase}"`);
    }
  }

  // ── 3. mustNotContain ──────────────────────────────────────────────
  for (const phrase of fixture.mustNotContain ?? []) {
    // Case-insensitive: blocked phrases like "I recommend buying" should
    // catch "i recommend Buying" too.
    if (haystack.toLowerCase().includes(phrase.toLowerCase())) {
      failures.push(`forbidden phrase present: "${phrase}"`);
    }
  }

  // ── 4. shapeChecks ─────────────────────────────────────────────────
  for (const check of fixture.shapeChecks ?? []) {
    const ok = evaluateShapeCheck(response, check);
    if (!ok.passed) failures.push(`shape check failed: ${check} — ${ok.reason}`);
  }

  // ── 5. Compliance check (always for fixtures with `requireCompliance`) ─
  if (fixture.requireCompliance && !response.meta.compliance?.passed) {
    failures.push('compliance.passed !== true');
  }

  // ── 6. LLM-as-judge (optional) ─────────────────────────────────────
  let judgeNotes = '';
  let llmScore: number | undefined;
  if (opts.useLLM && fixture.rubric) {
    const llmResult = await runLLMJudge(response, fixture.rubric);
    llmScore = llmResult.score;
    judgeNotes = llmResult.notes;
    if (llmScore < 0.6) {
      failures.push(`LLM judge score below threshold: ${llmScore.toFixed(2)}`);
    }
  }

  const passed = failures.length === 0;
  // Score: 1.0 if all deterministic checks pass; LLM score blended if present.
  const detPassRate = passed ? 1.0 : Math.max(0, 1 - failures.length / 5);
  const score =
    llmScore !== undefined ? 0.6 * detPassRate + 0.4 * llmScore : detPassRate;

  return { fixtureId: fixture.id, passed, score, failures, judgeNotes };
}

function buildHaystack(res: RalphResponse): string {
  const parts: string[] = [
    res.answer,
    ...res.why,
    ...(res.assumptions ?? []),
    ...(res.nextSteps ?? []),
  ];
  for (const a of res.agents) {
    parts.push(a.summary);
    parts.push(...(a.evidence ?? []));
    parts.push(...(a.warnings ?? []));
  }
  return parts.join('\n');
}

/**
 * Tiny safe expression evaluator for shape checks like:
 *   "agents.length >= 1"
 *   "meta.compliance.disclaimerAppended === true"
 *   "agents[0].score > 5"
 *
 * Limited grammar: dotted/bracket path → comparator → literal.
 * Supported comparators: ===, !==, >=, <=, >, <
 */
function evaluateShapeCheck(res: RalphResponse, expr: string): { passed: boolean; reason: string } {
  const m = expr.match(/^\s*([\w[\].]+)\s*(===|!==|>=|<=|>|<)\s*(.+?)\s*$/);
  if (!m) return { passed: false, reason: `unparseable: ${expr}` };
  const [, path, op, rhsRaw] = m;
  const lhs = resolvePath(res, path);
  const rhs = parseLiteral(rhsRaw);
  switch (op) {
    case '===': return { passed: lhs === rhs, reason: `${stringify(lhs)} !== ${stringify(rhs)}` };
    case '!==': return { passed: lhs !== rhs, reason: `${stringify(lhs)} === ${stringify(rhs)}` };
    case '>=': return { passed: typeof lhs === 'number' && typeof rhs === 'number' && lhs >= rhs, reason: `${lhs} < ${rhs}` };
    case '<=': return { passed: typeof lhs === 'number' && typeof rhs === 'number' && lhs <= rhs, reason: `${lhs} > ${rhs}` };
    case '>': return { passed: typeof lhs === 'number' && typeof rhs === 'number' && lhs > rhs, reason: `${lhs} <= ${rhs}` };
    case '<': return { passed: typeof lhs === 'number' && typeof rhs === 'number' && lhs < rhs, reason: `${lhs} >= ${rhs}` };
    default: return { passed: false, reason: `unknown op ${op}` };
  }
}

function resolvePath(obj: unknown, path: string): unknown {
  // "agents[0].score" → ["agents", "0", "score"]
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function parseLiteral(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (raw === 'undefined') return undefined;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  // String literal — strip surrounding quotes if present.
  return raw.replace(/^['"]|['"]$/g, '');
}

function stringify(v: unknown): string {
  return typeof v === 'string' ? `"${v}"` : String(v);
}

/**
 * LLM-as-judge. Stub. Group 4 of RALPH_TASK.md fills in the actual call —
 * it should use `openAIChat` from `@/lib/llm/openai` with a tightly scoped
 * system prompt that returns ONLY valid JSON `{ score, notes }`.
 *
 * Score scale: 0.0 (fails the rubric) → 1.0 (perfectly satisfies it).
 */
async function runLLMJudge(_res: RalphResponse, _rubric: string): Promise<{ score: number; notes: string }> {
  // TODO(group-4): real implementation.
  return { score: 1.0, notes: 'LLM judge not implemented yet — returning neutral pass.' };
}
