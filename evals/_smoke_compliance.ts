/**
 * Standalone smoke test for the SEBI compliance layer.
 *
 * Runs WITHOUT booting the orchestrator (no Prisma, no broker tokens, no
 * LLM keys needed). Useful in CI as a fast pre-check before the full
 * `npm run eval:smoke`.
 *
 * Usage: `npx tsx evals/_smoke_compliance.ts`
 */

import { applyCompliance, BLOCKED_PATTERNS, DISCLAIMER_MARKER } from '../lib/ralph/compliance';
import type { RalphResponse } from '../lib/ralph/types';

const draft: RalphResponse = {
  answer: [
    'Reliance is a strong company. You should buy Reliance now — it is 100% safe',
    'and the price will definitely hit ₹3500 next month with guaranteed returns.',
    'I recommend buying it before earnings.',
  ].join(' '),
  why: ['You should sell HDFC because returns are assured.'],
  agents: [
    {
      agent: 'Fundamental',
      summary: 'Definitely buy: PE 22, ROE 14%.',
      evidence: ['I recommend buying. The risk-free returns are 12%.'],
    },
  ],
  meta: { intent: 'stock', latencyMs: 0 },
};

const sanitised = applyCompliance(draft);

const checks: Record<string, boolean> = {
  hasDisclaimer: sanitised.answer.includes(DISCLAIMER_MARKER),
  noYouShouldBuy: !/you\s+should\s+buy/i.test(sanitised.answer),
  noGuaranteed: !/guaranteed/i.test(sanitised.answer),
  noDefinitely: !/definitely\s+buy/i.test(sanitised.answer),
  no100Safe: !/100%\s+safe/i.test(sanitised.answer),
  noFirstPersonRecommend: !/I recommend buying/i.test(sanitised.answer),
  agentSanitised: !/Definitely buy/i.test(sanitised.agents[0].summary),
  evidenceSanitised: !/I recommend buying/i.test(sanitised.agents[0].evidence?.[0] ?? ''),
  whyContextSanitised: !/assured/i.test(sanitised.why[0]),
  metaPopulated: sanitised.meta.compliance?.passed === true,
  rulesFiredCount: (sanitised.meta.compliance?.rulesFired.length ?? 0) >= 4,
  idempotent: applyCompliance(sanitised).answer === sanitised.answer,
};

let failed = 0;
console.log('\nCompliance smoke checks:');
for (const [name, ok] of Object.entries(checks)) {
  console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  if (!ok) failed++;
}
console.log(`\nRules in registry: ${BLOCKED_PATTERNS.length}`);
console.log(`Rules fired:       ${sanitised.meta.compliance?.rulesFired.join(', ')}`);
console.log(`Edits made:        ${sanitised.meta.compliance?.edits.length}`);

if (failed > 0) {
  console.error(`\n✗ ${failed} check(s) failed`);
  process.exit(1);
}
console.log('\n✓ All compliance checks pass');
