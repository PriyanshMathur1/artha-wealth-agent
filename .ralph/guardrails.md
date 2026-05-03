# Guardrails ("Signs")

These are lessons that future iterations of this loop must read before doing work.
Each sign is a rule that, if ignored, has cost time on this codebase.

---

### Sign: Don't break the existing stock pipeline
- **Trigger**: Editing `lib/ralph/agents/stock.ts` or `lib/agents/*`
- **Instruction**: The 6 per-stock agents are wired into `/api/analyze/[ticker]` and the
  Deep Scan UI. Treat them as a stable contract. Do not change return shapes or
  rename exports. The Ralph stock agent only consumes them.

### Sign: Angel One can be unauthenticated
- **Trigger**: Calling `getQuote`, `getSummary`, `getHistory`, or `runRebalance`
- **Instruction**: All Angel One paths can throw if no broker token is set. Wrap in
  try/catch and degrade gracefully — never let portfolio chat 500 because the user
  hasn't connected a broker.

### Sign: MFAPI returns dates as DD-MM-YYYY
- **Trigger**: Parsing `NavEntry.date` in MF code paths
- **Instruction**: Use the existing helpers in `lib/mfapi.ts` (`getMFTrailingReturns`,
  `getMFDirection`, `getCurrentNav`) instead of re-parsing dates. They already
  handle both YYYY-MM-DD and DD-MM-YYYY.

### Sign: Don't ship token-greedy LLM calls in the hot path
- **Trigger**: Adding new `openAIChat` calls
- **Instruction**: Stock / MF / portfolio paths are deterministic and cheap. Only
  the General agent uses LLM. If you add a synthesizer, cap `maxTokens ≤ 700`
  and pass only summarised findings — never raw history arrays.

### Sign: Router false positives on uppercase tokens
- **Trigger**: Editing the regex `\b([A-Z]{2,12})\b` in `lib/ralph/router.ts`
- **Instruction**: "I", "AND", "TO", "MY", "FOR" all match. Validate candidates
  against `NSE_UNIVERSE` from `lib/universe.ts` before treating them as tickers.

### Sign: ChatTurn store has a stale-update quirk
- **Trigger**: Editing `lib/ralph/store.ts` `appendMessage`
- **Instruction**: The current code does a redundant findUnique inside the title
  update to bump `updatedAt`. Don't "clean it up" without checking that
  `@updatedAt` actually fires on a no-op update — Prisma 7 may skip it.

---

# Iteration 3 signs (best-in-finance enhancement)

### Sign: Compliance runs LAST, on EVERY response
- **Trigger**: Editing `lib/ralph/orchestrator.ts` or any new path that returns
  a `RalphResponse`
- **Instruction**: `applyCompliance(response)` must be the final transformation
  before returning. This includes the streaming path (Group 2) — call it on
  the synth answer before the `DoneEvent`. Including error paths. There must
  be NO branch that returns a `RalphResponse` without going through compliance.

### Sign: SEBI disclaimer is idempotent — never double-append
- **Trigger**: Editing `lib/ralph/compliance.ts` `applyCompliance`
- **Instruction**: Check for the disclaimer marker (the literal string
  `DISCLAIMER_MARKER` exported from compliance.ts) before appending. If the
  marker is already in `answer`, skip the append. This matters when the
  orchestrator already added it AND a downstream synth re-runs.

### Sign: Don't strip target prices that cite a source
- **Trigger**: Adding patterns to `BLOCKED_PHRASES` in `compliance.ts`
- **Instruction**: A target like "₹3,200 (Motilal Oswal, 2025-04-12)" is fine —
  it's analyst commentary, not Artha's own recommendation. The block rule is
  for unsourced numerics. Look at `agents[].data.sources[]` first; if a number
  appears there, leave it alone.

### Sign: SSE responses must be flushed, not buffered
- **Trigger**: Editing `app/api/chat/stream/route.ts`
- **Instruction**: Next.js App Router streams via `new ReadableStream`. You
  MUST `controller.enqueue(encoder.encode(line))` per event AND set headers
  `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`,
  `X-Accel-Buffering: no`. Without `X-Accel-Buffering` Vercel buffers the
  whole stream and defeats the point.

### Sign: Streaming + compliance interaction
- **Trigger**: Implementing token-by-token streaming on the General intent
- **Instruction**: Don't run `applyCompliance` on partial tokens — that
  re-rewrites mid-sentence and looks broken. Buffer the full LLM answer in
  memory (it's ≤ 700 tokens), run compliance once, then emit the final
  sanitised answer as a single `DoneEvent`. Token events on the wire are for
  UX shimmer only; the authoritative answer is in `DoneEvent.payload`.

### Sign: Data source priority is broker-token-aware
- **Trigger**: Editing `lib/data/source.ts` `withFallback`
- **Instruction**: Angel One has higher data quality (live NSE quotes) but
  requires a per-user broker token. If `getQuote` throws "no token", that's
  not a "source unhealthy" event — it's a per-user state. Don't put the
  source in cooldown; just skip it for that call. Cooldown is for actual
  outages (rate limit, 5xx, timeout).

### Sign: Market state matters for staleness
- **Trigger**: Adding the freshness bullet to agent evidence
- **Instruction**: A 5-min-old quote at 14:30 IST is stale; a 5-min-old quote
  at 22:00 IST (market closed) is the latest available. Read
  `isMarketOpen()` before deciding whether to flag staleness. Flag only
  during market hours.

### Sign: Eval fixtures must be deterministic-first
- **Trigger**: Adding a fixture to `evals/golden/`
- **Instruction**: Every fixture MUST have at least one of `mustContain`,
  `mustNotContain`, or `shapeChecks`. The LLM-as-judge `rubric` is optional
  and additive. A fixture that is rubric-only fails the regression gate
  arbitrarily because LLM scores have variance.

### Sign: Eval calls ralphRespond directly, NOT HTTP
- **Trigger**: Implementing `evals/run.ts`
- **Instruction**: `import { ralphRespond } from '@/lib/ralph/orchestrator'`
  and call it as a function. Going through `/api/chat` requires booting the
  Next.js dev server, doubles the latency, and adds a network failure mode
  to the eval. The compliance layer is in the orchestrator, not the route,
  so direct calls still get sanitised output.

### Sign: Worktree boundaries — one group per worktree
- **Trigger**: Running parallel Ralph
- **Instruction**: Each worktree iterates on EXACTLY ONE group's checkboxes.
  The "touches" line at the top of each group section is the merge
  contract. If Group 2 needs to read something from Group 1's
  compliance.ts, that's fine (read-only); it must NOT edit it.

### Sign: Don't add npm deps without an explicit checkbox
- **Trigger**: `npm install <package>`
- **Instruction**: This task allows zero new runtime deps. `tsx` for the
  eval runner is the only acceptable dev dep, and only if not already
  present (check `package.json` first). LangChain, Vercel AI SDK, etc. are
  out-of-scope per RALPH_TASK.md. If you think you need a dep, add a
  checkbox to RALPH_TASK.md, stop, and surface it to the human.
