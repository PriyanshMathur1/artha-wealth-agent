# Ralph PROMPT — Artha multi-agent chat

You are continuing work on the Artha Terminal multi-agent chat. Read these files
in order, then make ONE incremental change toward an unchecked box in
`RALPH_TASK.md`. Then commit.

## Read first (every iteration)
1. `RALPH_TASK.md` — what "done" means, with `[ ]` checkboxes.
2. `.ralph/guardrails.md` — rules / Signs you MUST obey. Add to it after a failure.
3. `.ralph/progress.md` — what previous iterations finished.
4. `.ralph/errors.log` — most recent failure, if any. If non-empty, fix that first.

## Codebase map
- `lib/ralph/` — multi-agent chat (router, orchestrator, types, store, agents/).
- `lib/agents/` — the 6 per-stock specialists (fundamental, technical, moat,
  growth, risk, sentiment). Stable contract; do not change shapes.
- `lib/mfapi.ts` — MFAPI.in client (NAV, trailing returns, direction).
- `lib/angelone.ts` — Angel One quote/summary/history wrapper. Can fail when no
  broker token is configured — handle defensively.
- `lib/rebalancer.ts` — `runRebalance(userId)` returns a `RebalanceReport`.
- `lib/universe.ts` — `NSE_UNIVERSE` symbol list. Use it to validate router
  ticker candidates.
- `app/chat/page.tsx` — the UI. Renders ChatTurn[] and posts to `/api/chat`.
- `app/api/chat/route.ts` — entry point; calls `ralphRespond`.

## Rules
1. **One unchecked box per iteration.** Pick the lowest-numbered unchecked one.
   In worktree mode (env `RALPH_GROUP=N` is set, or `.ralph/current-group`
   exists), only consider boxes annotated `<!-- group: N -->`. Ignore boxes
   from other groups even if they're unchecked.
2. **Update `progress.md`** at the end of each iteration with what changed.
   Prefix the entry with the group number when in worktree mode.
3. **Append to `guardrails.md`** when you hit a failure mode worth remembering.
4. **Stop and rotate context** when this conversation crosses ~70k tokens. State
   lives in files; you can resume cleanly.
5. **Run `npx tsc --noEmit`** before declaring a box `[x]`. In worktree mode,
   restrict to the files your group is allowed to touch (see "Worktree
   contract" in RALPH_TASK.md). If a TS error appears in a file outside your
   group's scope, do NOT fix it — note it in progress.md and skip.
6. Output `<ralph>COMPLETE</ralph>` only when every `[ ]` in YOUR group is
   `[x]` (worktree mode), or when every `[ ]` in `RALPH_TASK.md` is `[x]`
   (single-context mode).
7. Output `<ralph>GUTTER</ralph>` if the same fix has been attempted three times.

## Style
- Keep edits surgical; prefer `Edit` over `Write` on existing files.
- Don't rename exports — other parts of the app import them.
- Don't introduce new third-party deps without an explicit checkbox in the task.
- LLM calls only in the General agent; everything else is deterministic.
