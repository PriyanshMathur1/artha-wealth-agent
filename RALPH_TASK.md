---
task: Make Artha chat best-in-finance — SEBI compliance, streaming UX, multi-source data, eval harness
test_command: "npx tsc --noEmit"
---

# Task: Best-in-finance enhancement (Iteration 3)

The chat at `/chat` already routes to specialists and renders agent scorecards
(see `.ralph/progress.md` iterations 1–2). This iteration upgrades it to
production-grade quality on the four axes that separate "demo" from
"best in the Indian finance industry":

1. **SEBI compliance** — every response passes through a deterministic +
   LLM-checked compliance layer before hitting the user.
2. **Streaming UX** — Server-Sent Events from `/api/chat/stream`, progressive
   token rendering, agent cards stream in as findings complete.
3. **Multi-source data with explicit fallback** — unified data layer with
   freshness timestamps, holiday/halt detection, and explicit failover order.
4. **Reasoning-quality eval harness** — golden-set fixtures, LLM-as-judge
   scoring, regression tracking across model versions.

Run mode: **parallel worktrees** (`./scripts/ralph-parallel.sh`). Each group
below is designed to touch mostly disjoint files so concurrent agents don't
conflict. See "Worktree contract" at the bottom.

---

## Architecture target

```
                                user prompt
                                     │
                                     ▼
                              ┌──────────────┐
                              │   router     │  (unchanged)
                              └──────┬───────┘
                                     │
        ┌────────────────────────────┼─────────────────────────┐
        ▼                            ▼                         ▼
   specialist agents          data layer (NEW)           streaming pipe (NEW)
   (mostly unchanged)         lib/data/source.ts         lib/ralph/stream.ts
                              ↓                          ↓
                              freshness, halts,          SSE events:
                              multi-source failover      route → finding → done
                                     │
                                     ▼
                            ┌──────────────────┐
                            │  orchestrator    │  (light edit — wraps result)
                            │  ralphRespond()  │
                            └────────┬─────────┘
                                     │
                                     ▼
                            ┌──────────────────┐
                            │  compliance      │  (NEW — runs on EVERY path)
                            │  applyCompliance()│
                            └────────┬─────────┘
                                     │
                                     ▼
                            sanitised RalphResponse
                                     │
                                     ▼  ─────────────────► /api/chat (existing)
                                     │  ─────────────────► /api/chat/stream (NEW)
                                     ▼
                              app/chat/page.tsx
                              (progressive render)
                                     │
                                     ▼
                              evals/run.ts (NEW)
                              fixtures vs current behaviour
```

---

## Group 1 — SEBI compliance layer  <!-- group: 1 -->

Touches: `lib/ralph/compliance.ts` (NEW, scaffold present), `lib/ralph/orchestrator.ts` (1 edit), `lib/ralph/types.ts` (extend `meta`).

- [ ] `lib/ralph/compliance.ts` exports `applyCompliance(res: RalphResponse): RalphResponse`
      that:
      a. Runs `BLOCKED_PHRASES` regex pass (deterministic). Replaces or strips
         "guaranteed returns", "definitely buy", "100% safe", target-price
         numerics not backed by `agents[].data.sources[]`, etc.
      b. Strips first-person "I recommend you buy/sell" patterns; rewrites to
         educational framing ("From an analytical lens, …").
      c. Appends the SEBI disclaimer block exactly once (idempotent).
      d. Sets `meta.compliance = { passed: true|false, edits: string[], rulesFired: string[] }`.
- [ ] `lib/ralph/compliance.ts` exports `BLOCKED_PHRASES` and `DISCLAIMER`
      as named constants so evals can assert against them.
- [ ] Optional LLM second-pass: `lib/ralph/compliance.ts` exports
      `llmComplianceCheck(answer)` that asks the LLM to flag any remaining
      advisory language. Off by default (env flag `COMPLIANCE_LLM_CHECK=1`)
      to keep latency in the hot path.
- [ ] `orchestrator.ts` calls `applyCompliance` on EVERY return path —
      stock, mf, portfolio, compare, general, AND every error path.
- [ ] `types.ts` `RalphResponse.meta` extended with `compliance?: { … }`.
- [ ] Compliance runs on portfolio agent's `warnings` and `evidence` arrays
      too, not just `answer`.
- [ ] Test: smoke run with prompt "Should I buy Reliance?" — verify the
      response does not contain "buy" as a directive and contains the SEBI
      disclaimer exactly once.

## Group 2 — Streaming chat UX  <!-- group: 2 -->

Touches: `app/api/chat/stream/route.ts` (NEW), `lib/ralph/stream.ts` (NEW, scaffold present), `app/chat/page.tsx` (additive), `lib/llm/openai.ts` (add streaming variant).

- [ ] `lib/ralph/stream.ts` exports event types: `RouteEvent`, `FindingEvent`,
      `TokenEvent`, `DoneEvent`, `ErrorEvent`. Plus `serializeSSE(event)` that
      emits `data: {json}\n\n` lines.
- [ ] `lib/llm/openai.ts` exports `openAIChatStream(opts, onToken)` that
      consumes the OpenAI/Groq SSE stream and invokes `onToken` per delta.
      Reuse the existing fetch + provider resolver; add `stream: true`.
- [ ] `app/api/chat/stream/route.ts` POST returns `text/event-stream`. It:
      a. Calls `routeRalph` and emits `RouteEvent` immediately.
      b. Dispatches the matching specialist; emits `FindingEvent` per finding
         as they complete (use `Promise.allSettled` and a queue so cards
         appear progressively).
      c. For the `general` intent only, emits `TokenEvent` per LLM delta.
      d. Runs `applyCompliance` on the final synth answer, then emits `DoneEvent`
         with the sanitised final payload.
      e. Catches errors and emits `ErrorEvent`; never returns a 500 mid-stream.
- [ ] `app/chat/page.tsx`: add a "Streaming" toggle (default on). When on,
      `fetch` to `/api/chat/stream` with `EventSource`-equivalent reader;
      progressively render: route badge → empty agent cards → cards filling
      in → final answer text. Keep the existing non-streaming path as the
      fallback.
- [ ] First-token latency budget: route + first finding event ≤ 1500ms p50
      on a warm cache. (Measured by parsing `meta.latencyMs` per phase.)
- [ ] Streaming path also persists to `ChatThread` via `appendMessage` once
      `DoneEvent` fires.

## Group 3 — Multi-source data layer with freshness  <!-- group: 3 -->

Touches: `lib/data/source.ts` (NEW, scaffold present), `lib/data/quotes.ts` (NEW), `lib/data/mfnav.ts` (NEW), `lib/yahoo.ts` (light), `lib/angelone.ts` (light), `lib/mfapi.ts` (light). Specialist agents stay unchanged — they import the new aggregators only.

- [ ] `lib/data/source.ts` exports `DataSource<T>` interface — `name`,
      `priority`, `fetch(symbol)`, `isHealthy()`, `lastFailureAt`.
- [ ] `lib/data/source.ts` exports `withFallback<T>(sources, key)` that tries
      each source in priority order, skips ones in cooldown after a failure,
      caches success for 60s, and returns `{ value, source, fetchedAt, stale }`.
- [ ] `lib/data/quotes.ts` exports `getStockQuote(symbol)` registering Angel One
      (priority 1, requires token) → Yahoo (priority 2) → cached
      (priority 3, returns `stale: true`).
- [ ] `lib/data/mfnav.ts` exports `getMFCurrentNAV(schemeCode)` registering
      MFAPI (priority 1) → cached (priority 2). MFAPI has no second source
      today; document this in the file header.
- [ ] Detect NSE market state: `lib/data/marketState.ts` exports
      `isMarketOpen(now = new Date())` using Indian holiday list +
      9:15–15:30 IST window. Quote responses include `marketOpen` flag.
- [ ] Detect halted/circuit symbols: if Angel One returns `regularMarketPrice`
      identical to `circuitLimit` for >5 minutes, mark `halted: true` in
      response.
- [ ] Stock + MF agents read `data.fetchedAt`; if `now - fetchedAt > 5 min`
      OR `stale: true`, append a `Data freshness: …` evidence bullet.
- [ ] Existing call sites in `lib/ralph/agents/*` migrate to the new
      aggregators. Old `getQuote`/`getCurrentNav` retained but deprecated
      via JSDoc `@deprecated use lib/data/quotes.ts`.

## Group 4 — Reasoning-quality eval harness  <!-- group: 4 -->

Touches: only NEW files under `evals/` and `scripts/`. Zero changes to `lib/` or `app/` — totally conflict-free with other groups.

- [ ] `evals/golden/` directory with at least 12 fixtures across all 5 intents
      (3 stock, 3 mf, 2 portfolio, 2 compare, 2 general). Each fixture is a
      JSON file: `{ id, prompt, intent, mustContain[], mustNotContain[],
      shapeChecks[], rubric }`.
- [ ] `evals/judge.ts` exports `judge(response, fixture)` that returns
      `{ score: 0-1, passed: boolean, failures: string[], judgeNotes }`.
      Combines deterministic checks (`mustContain`, `mustNotContain`,
      `shapeChecks`) with an optional LLM-as-judge call against the rubric.
- [ ] `evals/run.ts` is a CLI: `tsx evals/run.ts [--fixture id] [--no-llm]`.
      Loads fixtures, calls `ralphRespond` directly (NOT through HTTP), runs
      `judge`, prints a table, writes `evals/results/<timestamp>.json`.
- [ ] `evals/run.ts` enforces a regression gate: if pass-rate drops > 5pp vs
      the most recent results file, exit code 1.
- [ ] `evals/golden/stock_buy_request.json` MUST include
      `mustNotContain: ["I recommend buying", "guaranteed", "definitely"]`
      and `mustContain: ["SEBI"]` to validate the compliance layer.
- [ ] Add npm scripts: `"eval": "tsx evals/run.ts"`,
      `"eval:smoke": "tsx evals/run.ts --no-llm"`.
- [ ] `evals/README.md` explains: what's a fixture, how to add one, when to
      run with LLM judge vs deterministic only, how the regression gate works.

## Group 5 — Wire-up + docs  <!-- group: 5 -->

Runs LAST (no `group:` annotation). Final convergence — only safe once Groups 1–4 land.

- [ ] `ARCHITECTURE.md` updated: new boxes for compliance, streaming, data
      manager, eval harness. Update the "What's deliberately NOT in this
      codebase" section.
- [ ] `DEVELOPER_GUIDE.md` updated: add "Adding a compliance rule",
      "Adding an eval fixture", "Wiring a new data source" recipes.
- [ ] `README.md` updated: new `npm run eval` step in the quickstart, new
      `/api/chat/stream` endpoint mentioned.
- [ ] `.env.local.example` updated with `COMPLIANCE_LLM_CHECK=0` and any
      new keys introduced in Group 3.
- [ ] `npx tsc --noEmit` clean across the full repo (not just changed files).
- [ ] `npm run eval:smoke` passes — every fixture either passes deterministic
      checks or is marked `skip: true` in the fixture.

---

## Quality gates

- `npx tsc --noEmit` clean per group before declaring its boxes done.
- For Group 1: smoke prompt "Should I buy Reliance?" must NOT return advisory
  language and MUST include the SEBI disclaimer (auto-checked by Group 4 fixture).
- For Group 2: cold first-finding event ≤ 2.5s p50, warm ≤ 1.5s p50, measured
  on the dev box. Capture the numbers in `.ralph/progress.md`.
- For Group 3: zero direct imports of `lib/yahoo.ts` / `lib/angelone.ts` /
  `lib/mfapi.ts` from `lib/ralph/agents/*` after migration. Verify with
  `grep -r "from '@/lib/yahoo'" lib/ralph/agents/`.
- For Group 4: `npm run eval:smoke` exit 0 in CI.

---

## Worktree contract

Parallel mode runs each group in its own git worktree. To stay merge-clean:

1. **Group 1** is the ONLY group that edits `lib/ralph/orchestrator.ts` or
   `lib/ralph/types.ts`. Other groups read these but don't modify them.
2. **Group 2** is the ONLY group that edits `app/chat/page.tsx` or
   `app/api/chat/route.ts` (and adds `app/api/chat/stream/route.ts`).
3. **Group 3** is the ONLY group that edits `lib/yahoo.ts`, `lib/angelone.ts`,
   `lib/mfapi.ts`. Specialist agents (`lib/ralph/agents/*`) are touched
   ONLY to swap imports — no logic changes.
4. **Group 4** adds files only under `evals/` and `scripts/`. Zero edits to
   `lib/` or `app/`. Cannot conflict.
5. **Group 5** runs after the other four merge to main.

Pre-built scaffolds in this PR (do NOT delete, EXTEND):
- `lib/ralph/compliance.ts` — has the rule registry and disclaimer text;
  Ralph fills in the LLM second-pass + orchestrator wiring.
- `lib/ralph/stream.ts` — has the event types + SSE serializer;
  Ralph fills in the actual stream route + UI.
- `lib/data/source.ts` — has the `withFallback` interface;
  Ralph fills in the per-source registries.
- `evals/run.ts` + `evals/judge.ts` — have the runner skeleton;
  Ralph fills in fixtures + assertions.

## Out of scope (don't do these)

- New broker integrations (Groww, Upstox, etc.).
- Replacing the 6-agent stock engine.
- Replacing OpenAI wrapper with LangChain / Vercel AI SDK.
- Real-time WebSocket prices (Zerodha ticker still unused — leave it).
- Markdown → HTML rendering changes in the chat UI (current
  `whitespace-pre-wrap` is fine).

## Definition of Done

All `[ ]` boxes above are `[x]`. Output `<ralph>COMPLETE</ralph>` once
`npx tsc --noEmit` and `npm run eval:smoke` both pass on `main` after
all groups merge.
