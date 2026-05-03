#!/usr/bin/env bash
#
# Parallel Ralph dispatcher for Artha iteration 3.
#
# Spins up 4 git worktrees (one per group from RALPH_TASK.md) and runs
# `ralph-loop.sh` in each, concurrently. Group 5 (docs) is run last,
# sequentially, after the other four merge.
#
# Why worktrees: each group only edits a disjoint set of files (see the
# "Worktree contract" in RALPH_TASK.md). Worktrees give each Ralph instance
# its own checked-out tree without copying node_modules, so they can run
# `npx tsc --noEmit` independently.
#
# Prerequisites:
#   - Ralph scripts installed at .cursor/ralph-scripts/
#   - On a clean git status (uncommitted changes are ambiguous in a worktree fanout)
#
# Usage:
#   ./scripts/ralph-parallel-dispatch.sh
#   ./scripts/ralph-parallel-dispatch.sh --dry-run
#   ./scripts/ralph-parallel-dispatch.sh --groups 1,3   # only Group 1 and 3

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKTREE_ROOT="${REPO_ROOT}/.ralph/worktrees"
BASE_BRANCH="${BASE_BRANCH:-main}"

DRY_RUN=0
GROUPS="1,2,3,4"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --groups)  GROUPS="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

declare -A GROUP_NAMES=(
  [1]="compliance"
  [2]="streaming"
  [3]="data-layer"
  [4]="evals"
)

mkdir -p "${WORKTREE_ROOT}"

run_or_echo() {
  if [[ "${DRY_RUN}" -eq 1 ]]; then
    echo "+ $*"
  else
    eval "$@"
  fi
}

# Ensure we're on a clean tree.
if [[ -n "$(git -C "${REPO_ROOT}" status --porcelain)" ]]; then
  echo "✗ Uncommitted changes. Commit or stash before running parallel Ralph." >&2
  exit 1
fi

git -C "${REPO_ROOT}" fetch origin "${BASE_BRANCH}" --quiet || true

# Spawn worktrees + Ralph instances.
PIDS=()
IFS=',' read -ra GROUP_LIST <<< "${GROUPS}"
for g in "${GROUP_LIST[@]}"; do
  name="${GROUP_NAMES[$g]:-}"
  if [[ -z "${name}" ]]; then
    echo "✗ Unknown group: $g" >&2
    exit 2
  fi
  branch="ralph/iter3-group-${g}-${name}"
  worktree="${WORKTREE_ROOT}/group-${g}-${name}"
  log="${worktree}.log"

  echo "→ Group ${g} (${name}) → branch ${branch}"

  # Create worktree (idempotent).
  if [[ ! -d "${worktree}" ]]; then
    run_or_echo "git -C '${REPO_ROOT}' worktree add -b '${branch}' '${worktree}' '${BASE_BRANCH}'"
  fi

  # Tell that Ralph instance which group it owns.
  run_or_echo "echo '${g}' > '${worktree}/.ralph/current-group'"

  # Spawn Ralph loop, scoped to that group.
  if [[ "${DRY_RUN}" -eq 0 ]]; then
    (
      cd "${worktree}"
      RALPH_GROUP="${g}" \
        ./.cursor/ralph-scripts/ralph-loop.sh \
        --branch "${branch}" \
        -y \
        > "${log}" 2>&1
    ) &
    PIDS+=("$!")
  fi
done

if [[ "${DRY_RUN}" -eq 1 ]]; then
  echo "Dry-run complete. Re-run without --dry-run to execute."
  exit 0
fi

echo
echo "Spawned ${#PIDS[@]} Ralph instance(s). Tail logs:"
for g in "${GROUP_LIST[@]}"; do
  name="${GROUP_NAMES[$g]:-}"
  echo "  tail -f ${WORKTREE_ROOT}/group-${g}-${name}.log"
done

# Wait for all workers; capture exit codes.
RC=0
for pid in "${PIDS[@]}"; do
  wait "${pid}" || RC=$?
done

if [[ "${RC}" -ne 0 ]]; then
  echo "✗ At least one Ralph instance exited non-zero. Check logs above." >&2
  exit "${RC}"
fi

echo
echo "✓ All groups completed. Next steps:"
echo "    1. Open the four PRs (or merge each branch into main)."
echo "    2. Resolve any conflicts in lib/ralph/orchestrator.ts (Group 1 owns it)."
echo "    3. Run Group 5 (docs) sequentially: edit RALPH_TASK.md group-5 boxes,"
echo "       then ./.cursor/ralph-scripts/ralph-loop.sh."
echo "    4. Run npm run eval:smoke to verify the regression gate."
