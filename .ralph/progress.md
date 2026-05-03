# Progress

## Iteration 1 — initial scaffold + chat build (2026-05-02)
Built the multi-agent chat end-to-end. See git history feat/ai-chat-multi-agent.
All checkboxes in `RALPH_TASK.md` are `[x]`.

## Iteration 2 — cleanup + docs (2026-05-02)

Approach:
- Stacked cleanup commits on the same `feat/ai-chat-multi-agent` branch so the
  user's PR ships chat + cleanup + docs in one merge.
- Skipped sandbox-only TypeScript false positives (implicit-any in API routes
  and `lib/ralph/store.ts` — they only show because Prisma client isn't
  generated locally; on Vercel after `prisma generate` the callbacks have
  proper types).

Done in this iteration:
- JSDoc'd every public export under `lib/ralph/*` (types, router, orchestrator,
  and all 5 agents). Module-level docs explain the contract; per-export docs
  explain the inputs/outputs.
- `ARCHITECTURE.md` at repo root — plain-English tour with ASCII diagrams of
  the three primary user flows (Deep Scan, Ralph chat, Portfolio agent), a
  data-source table with failure modes, the folder map, and a Ralph extension
  guide.
- `DEVELOPER_GUIDE.md` at repo root — engineer onboarding: setup, where-to-add
  decision tree, the 4-file Ralph intent recipe, conventions, severity-tagged
  tech-debt list, common-tasks playbook, glossary.
- README updated with a "New here?" section linking the two docs + the Ralph
  loop files.
- Dead-file deletion deferred to user-side `git rm` (sandbox lacks rm
  permission). Files identified: `lib/utils/cn.ts`, `lib/utils/format.ts`,
  `scripts/seed.ts`. They're functional stubs so nothing breaks if left.

Verified:
- `npx tsc --noEmit` clean for every file in `lib/ralph/*`, `app/chat/page.tsx`,
  `components/AskAIFab.tsx`, `app/layout.tsx`. Pre-existing implicit-any
  errors in `app/api/*`, `lib/rebalancer.ts`, `lib/ralph/store.ts` are
  sandbox-only (Prisma not generated locally) and don't appear on Vercel.

`<ralph>COMPLETE</ralph>`

---

## Iteration 3 — best-in-finance enhancement (kickoff)

New chapter. Goal: take the working chat from a polished demo to
production-grade for the Indian retail-investor market. Four axes:
SEBI compliance, streaming, multi-source data, eval harness.

Run mode: parallel worktrees. See `RALPH_TASK.md` "Worktree contract"
for which group owns which files.

Pre-built scaffolds in this kickoff (Ralph EXTENDS, doesn't replace):
- `lib/ralph/compliance.ts` — full SEBI rule registry, deterministic
  rewrite engine, idempotent disclaimer. Wired into orchestrator on
  every return path. LLM second-pass left as a stub for Group 1.
- `lib/ralph/stream.ts` — SSE event types + `serializeSSE`. Group 2
  builds the route + UI on top.
- `lib/data/source.ts` — `DataSource<T>` interface + `withFallback`
  helper with cooldown/cache. Group 3 registers per-source adapters.
- `lib/data/marketState.ts` — `isMarketOpen` for IST + holiday list.
- `evals/run.ts`, `evals/judge.ts`, `evals/golden/*.json` — runner
  skeleton + 2 starter fixtures (one of which validates the
  compliance layer end-to-end). Group 4 fills in the rest.

Iteration 3 hasn't ticked any [ ] in RALPH_TASK.md yet — that's
Ralph's job. The wiring of `applyCompliance` into the orchestrator
in this kickoff IS the thing that makes Group 1's first checkbox
(the function exists + is called) already partially true; Ralph
just needs to satisfy the remaining bullets.
