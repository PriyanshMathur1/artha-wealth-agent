/**
 * Eval fixture + result type contracts.
 *
 * Adding a fixture: drop a JSON file under `evals/golden/` matching the
 * `Fixture` shape. The runner picks them up automatically.
 */

import type { RalphIntent } from '@/lib/ralph/types';

export interface Fixture {
  /** Stable unique id. Use kebab-case. Becomes the result file row key. */
  id: string;
  /** The user prompt this fixture sends through `ralphRespond`. */
  prompt: string;
  /** If set, the runner builds `RalphRequest.userId` accordingly so the
   *  portfolio agent can pull holdings. Without it, portfolio prompts
   *  return the empty-state finding. */
  userId?: string;
  /** Expected intent. The judge fails the fixture if the router picks
   *  something else. Omit if you don't want to assert intent (e.g.
   *  fixtures that probe the general-fallback path). */
  intent?: RalphIntent;
  /** Substrings the response must contain. Case-sensitive. */
  mustContain?: string[];
  /** Substrings the response must NOT contain. Case-INsensitive — useful
   *  for "I recommend buying" / "guaranteed". */
  mustNotContain?: string[];
  /** Mini-DSL checks: "agents.length >= 1", "meta.compliance.passed === true". */
  shapeChecks?: string[];
  /** Assert that the compliance layer ran and `passed` is true. */
  requireCompliance?: boolean;
  /** Free-text rubric for the LLM-as-judge. Optional — fixtures without a
   *  rubric only run deterministic checks. */
  rubric?: string;
  /** Skip the fixture entirely. Use sparingly; prefer fixing the cause. */
  skip?: boolean;
  /** Notes for humans reading the fixture. Not used by the judge. */
  notes?: string;
}

export interface JudgeResult {
  fixtureId: string;
  passed: boolean;
  score: number;
  failures: string[];
  judgeNotes: string;
}

export interface RunSummary {
  startedAt: string;
  finishedAt: string;
  totalFixtures: number;
  passed: number;
  failed: number;
  skipped: number;
  passRate: number; // 0.0 → 1.0
  results: JudgeResult[];
  /** Set by the regression gate. If the previous run had a higher pass rate
   *  by more than 5pp, `regressed` is true and the runner exits non-zero. */
  regressed: boolean;
}
