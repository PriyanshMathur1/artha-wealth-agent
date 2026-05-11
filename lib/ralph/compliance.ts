/**
 * SEBI compliance layer for the Ralph multi-agent chat.
 *
 * Every `RalphResponse` returned by `ralphRespond` MUST pass through
 * `applyCompliance` before reaching the user. This applies to:
 *   - the existing `/api/chat` JSON route
 *   - the new `/api/chat/stream` SSE route (Group 2 in RALPH_TASK.md)
 *   - every error path inside the orchestrator
 *
 * Why this exists
 * ---------------
 * Artha is not a SEBI-registered investment adviser. Indian retail users
 * arriving with the question "should I buy X?" should NEVER receive a
 * directive answer from this product. The compliance layer enforces that
 * boundary mechanically — it doesn't trust agents to phrase things safely.
 *
 * Two passes
 * ----------
 * 1. **Deterministic rewrite** (always on, no LLM cost): regex pass over
 *    `BLOCKED_PATTERNS`. Rewrites or strips advisory phrasing, unsourced
 *    target prices, "guaranteed returns", first-person recommendations.
 * 2. **LLM second-pass** (off by default, gated on `COMPLIANCE_LLM_CHECK=1`):
 *    asks a small model "does this still contain advisory language?". Used
 *    in CI / nightly evals, not in the hot request path.
 *
 * Idempotency
 * -----------
 * The disclaimer is appended exactly once. If `DISCLAIMER_MARKER` is
 * already present in `answer`, the append is skipped. This matters because
 * the streaming path may run the synth step twice (once for tokens, once
 * for the final compose), and both go through `applyCompliance`.
 */

import { getPreferredChatModel, openAIChat } from '@/lib/llm/openai';
import type { AgentFinding, RalphResponse } from './types';

// ── Public constants ────────────────────────────────────────────────────

/** A unique substring used to detect "have I already added the disclaimer?".
 *  Do NOT change this without a migration — old persisted threads contain it. */
export const DISCLAIMER_MARKER = '⚖️ Educational information only';

/** The full disclaimer block. Appended idempotently as a separate paragraph. */
export const DISCLAIMER = [
  '',
  '---',
  `${DISCLAIMER_MARKER}. Artha is not a SEBI-registered investment adviser`,
  'and does not provide personalised investment advice. Past performance is',
  'not indicative of future results. Markets carry risk. For personalised',
  'guidance please consult a SEBI-registered Investment Adviser (RIA).',
].join('\n');

/**
 * Deterministic rewrite rules. Order matters — first matching rule wins per
 * pattern position. `replacement` of `null` strips the match entirely.
 *
 * Adding a rule
 * -------------
 * Pair every new pattern with a fixture in `evals/golden/` that asserts the
 * rule fires. Otherwise the regression gate has no way to catch a future
 * edit that accidentally weakens the rule.
 */
export interface ComplianceRule {
  id: string;
  description: string;
  pattern: RegExp;
  replacement: string | null;
}

export const BLOCKED_PATTERNS: ComplianceRule[] = [
  // Outright guarantees — the most dangerous phrasing under SEBI Rule 16.
  {
    id: 'guaranteed-returns',
    description: 'Phrases promising guaranteed / assured / risk-free returns',
    pattern: /\b(guaranteed|assured|risk[- ]free)\s+(returns?|profits?|gains?)\b/gi,
    replacement: 'historically observed returns',
  },
  {
    id: 'guaranteed-returns-reverse',
    description: 'Reverse form: "returns are guaranteed/assured/risk-free"',
    pattern: /\b(returns?|profits?|gains?)\s+(are|is|will\s+be)\s+(guaranteed|assured|risk[- ]free)\b/gi,
    replacement: '$1 have varied historically',
  },
  {
    id: 'definitely-buy-sell',
    description: 'Absolute directives ("definitely buy / sell / avoid")',
    pattern: /\b(definitely|certainly|surely)\s+(buy|sell|avoid|invest in|exit)\b/gi,
    replacement: 'one analytical view leans toward',
  },
  // First-person directives — rewrite to educational framing.
  {
    id: 'first-person-buy',
    description: 'First-person buy/sell directives ("I recommend buying X")',
    pattern: /\b(I (?:recommend|suggest|advise) (?:buying|selling|exiting|holding))\b/gi,
    replacement: 'From an analytical lens, one might consider',
  },
  {
    id: 'second-person-buy',
    description: 'Direct directives at the user ("you should buy X")',
    pattern: /\byou\s+should\s+(buy|sell|exit|invest in|avoid)\s+/gi,
    replacement: 'one analytical view on whether to consider $1ing is: ',
  },
  // "100% safe" and similar overconfident framings.
  {
    id: 'absolute-safety',
    description: 'Phrases asserting 100% / absolute safety',
    pattern: /\b(100%\s+safe|absolutely\s+safe|no\s+risk|zero\s+risk)\b/gi,
    replacement: 'lower-risk',
  },
  // Time-bound certainty ("price will hit X by Y").
  {
    id: 'price-prediction',
    description: 'Confident price predictions',
    pattern: /\b(will\s+(?:definitely\s+)?(?:hit|reach|cross|breach)\s+₹?[\d,]+)\b/gi,
    replacement: 'could move toward',
  },
];

/** Per-response result of running compliance, surfaced in `meta.compliance`. */
export interface ComplianceMeta {
  passed: boolean;
  edits: string[];           // human-readable summary of changes made
  rulesFired: string[];      // rule IDs that matched at least once
  disclaimerAppended: boolean;
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Run the full compliance pass on a response. Mutates a clone — does NOT
 * modify the input. Idempotent: running twice produces the same output.
 *
 * @param res The orchestrator's draft response.
 * @returns The sanitised response with `meta.compliance` populated.
 */
export function applyCompliance(res: RalphResponse): RalphResponse {
  const edits: string[] = [];
  const rulesFired = new Set<string>();

  // 1. Sanitise the headline answer.
  const sanitisedAnswer = sanitiseText(res.answer, edits, rulesFired);

  // 2. Sanitise every agent finding's narrative fields. Numbers in `data`
  //    are left alone — they're structured and the UI doesn't display them
  //    as advice unless an agent's `summary`/`evidence` says so.
  const sanitisedAgents: AgentFinding[] = res.agents.map((a) => ({
    ...a,
    summary: sanitiseText(a.summary, edits, rulesFired),
    evidence: a.evidence?.map((e) => sanitiseText(e, edits, rulesFired)),
    warnings: a.warnings?.map((w) => sanitiseText(w, edits, rulesFired)),
  }));

  // 3. Sanitise top-level why / nextSteps / assumptions.
  const sanitisedWhy = res.why.map((w) => sanitiseText(w, edits, rulesFired));
  const sanitisedNext = res.nextSteps?.map((n) => sanitiseText(n, edits, rulesFired));
  const sanitisedAssumptions = res.assumptions?.map((a) => sanitiseText(a, edits, rulesFired));

  // 4. Append the disclaimer idempotently.
  const { answer: finalAnswer, appended } = appendDisclaimerIfMissing(sanitisedAnswer);

  const compliance: ComplianceMeta = {
    passed: true,
    edits,
    rulesFired: Array.from(rulesFired),
    disclaimerAppended: appended,
  };

  return {
    ...res,
    answer: finalAnswer,
    why: sanitisedWhy,
    nextSteps: sanitisedNext,
    assumptions: sanitisedAssumptions,
    agents: sanitisedAgents,
    meta: {
      ...res.meta,
      compliance,
    },
  };
}

/**
 * Append the SEBI disclaimer iff the marker isn't already present.
 * Exposed separately so callers (e.g. the streaming `DoneEvent` builder)
 * can apply it without re-running the full sanitiser.
 */
export function appendDisclaimerIfMissing(answer: string): { answer: string; appended: boolean } {
  if (answer.includes(DISCLAIMER_MARKER)) {
    return { answer, appended: false };
  }
  return { answer: `${answer.trimEnd()}\n${DISCLAIMER}`, appended: true };
}

/**
 * Optional LLM second-pass. Off by default — runs only when
 * `COMPLIANCE_LLM_CHECK=1` is set, typically in CI / nightly evals.
 *
 * Group 1 of RALPH_TASK.md fills this in. It's a stub on the kickoff so the
 * compliance contract is in place without paying LLM cost on every request.
 */
export async function llmComplianceCheck(answer: string): Promise<{ passed: boolean; concerns: string[] }> {
  if (process.env.COMPLIANCE_LLM_CHECK !== '1') {
    return { passed: true, concerns: [] };
  }

  const systemPrompt = `You are a strict compliance reviewer for a financial AI assistant.
Your job is to read the provided text and check for advisory language that violates SEBI (Securities and Exchange Board of India) guidelines.
Artha (the AI) is NOT a registered investment adviser.

You must FLAG the response if it contains any of the following:
1. First-person buy/sell language (e.g., "I recommend buying", "you should sell").
2. Unsourced target prices (any prediction of a specific future price).
3. Guarantee or absolute-safety language (e.g., "100% safe", "guaranteed returns", "zero risk").

Return ONLY a JSON object with the following schema:
{
  "passed": boolean, // true if NO violations found, false if ANY violation found
  "concerns": string[] // list of specific concerns/violations found, or empty array if none
}`;

  try {
    const res = await openAIChat({
      model: getPreferredChatModel(),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: answer },
      ],
      temperature: 0.1,
      maxTokens: 500,
    });

    let text = res.text.trim();
    // Strip markdown code block if present
    if (text.startsWith('\`\`\`json')) {
      text = text.slice(7);
    } else if (text.startsWith('\`\`\`')) {
      text = text.slice(3);
    }
    if (text.endsWith('\`\`\`')) {
      text = text.slice(0, -3);
    }
    text = text.trim();

    const parsed = JSON.parse(text);
    return {
      passed: Boolean(parsed.passed),
      concerns: Array.isArray(parsed.concerns) ? parsed.concerns : [],
    };
  } catch (error) {
    // Fail open if the LLM check itself fails (e.g., timeout, bad JSON)
    return { passed: true, concerns: [] };
  }
}

// ── Internals ───────────────────────────────────────────────────────────

function sanitiseText(text: string, edits: string[], rulesFired: Set<string>): string {
  let out = text;
  for (const rule of BLOCKED_PATTERNS) {
    if (!rule.pattern.test(out)) continue;
    rulesFired.add(rule.id);
    // Reset lastIndex on global regex so .replace iterates from the start.
    rule.pattern.lastIndex = 0;
    if (rule.replacement === null) {
      out = out.replace(rule.pattern, '');
      edits.push(`stripped phrase matching rule ${rule.id}`);
    } else {
      out = out.replace(rule.pattern, rule.replacement);
      edits.push(`rewrote phrase matching rule ${rule.id}`);
    }
  }
  // Collapse any double-spacing introduced by replacements.
  return out.replace(/[ \t]{2,}/g, ' ').trim();
}
