# Artha eval harness

Golden-set + LLM-as-judge for the Ralph chat. Catches regressions in
routing, agent quality, and SEBI compliance before they ship.

## Run

```bash
npm run eval            # all fixtures, LLM judge on
npm run eval:smoke      # deterministic only (CI gate)
npx tsx evals/run.ts --fixture stock-buy-request-compliance   # single fixture, debug
```

Results are written to `evals/results/<timestamp>.json`. The runner exits
non-zero if:

- Any fixture's deterministic checks fail, OR
- The pass-rate regresses by more than 5 percentage points from the most
  recent run.

## Fixture shape

Drop a JSON file under `evals/golden/`:

```jsonc
{
  "id": "kebab-case-id",                    // unique
  "prompt": "Should I buy Reliance?",       // user message
  "intent": "stock",                        // expected router intent (optional)
  "mustContain": ["SEBI"],                  // case-sensitive substrings required
  "mustNotContain": ["you should buy"],     // case-INsensitive substrings forbidden
  "shapeChecks": [                          // mini-DSL: path op literal
    "agents.length >= 1",
    "meta.compliance.passed === true"
  ],
  "requireCompliance": true,                // assert compliance.passed
  "rubric": "Free-text rubric for LLM judge — only used with `npm run eval`",
  "notes": "Why this fixture exists"
}
```

### Shape-check DSL

`<path> <op> <literal>` — supports `===`, `!==`, `>`, `<`, `>=`, `<=`.

- Paths: dotted plus `[0]` indexing. `agents[0].score`, `meta.compliance.passed`.
- Literals: `true`, `false`, `null`, numbers, or quoted strings.

If you need richer assertions, add them as a `mustContain` substring or a
new shape-check operator (the parser is in `evals/judge.ts`).

## When to run with LLM judge vs deterministic only

| Mode | When | Why |
|---|---|---|
| `eval:smoke` (deterministic) | CI on every PR | Zero variance, fast, free |
| `eval` (LLM judge) | Nightly / before release | Catches semantic regressions deterministic checks miss |

The regression gate uses the *combined* score, so a flaky LLM judge can
trip CI. Prefer keeping the deterministic checks comprehensive enough that
the LLM judge is a tiebreaker, not the primary signal.

## Adding a fixture for a SEBI rule

If you add a new rule to `lib/ralph/compliance.ts`, also add a fixture
that exercises it:

1. Pick a prompt that historically triggered the bad phrasing.
2. Add the bad phrasing to `mustNotContain`.
3. Add a stable safe-fragment to `mustContain` if your rewrite produces one
   (e.g. "From an analytical lens").

Without a fixture, a future edit can weaken the rule and CI won't catch it.
