# Test Plan — Worktree Parallelization

**Feature:** adev-managed git worktrees (`adev worktree` verb + `lib/worktree.mjs`) enabling
`/adev:implement --parallel` and parallel `/adev:build --milestone`.

**Design basis:** adev's graduated eval harness (`/adev:eval`, 0–100 across four layers) plus an
A/B comparison eval (`tests/evals/token-optimization/` style). This plan follows that structure
exactly.

**Prime directive (from the request):** *the main uses of adev must keep working properly.* Every
new capability is gated behind an equivalence check against the current serial behavior — parallel
execution may not change the *result*, only the *wall-clock*.

---

## 1. Scope

| In scope | Out of scope |
|---|---|
| `lib/worktree.mjs` primitive (add/list/merge/remove/guard, nesting prevention) | Rewriting the harness's Agent-tool isolation |
| `adev worktree` CLI verb contract | Non-git VCS |
| `/adev:implement --parallel` consuming the plan's existing `## Parallelization` groups | Changing the plan's group-detection algorithm |
| Parallel `/adev:build --milestone` (independent specs) | Cross-repo / submodule worktrees |
| Shared issue-board correctness under concurrent writers | New issue-board backend |
| **Regression: serial `/adev:implement` and `/adev:build` are byte-for-byte unchanged** | |

---

## 2. What "the main uses work properly" means (equivalence matrix)

The core adev lifecycle uses must be verified in three modes. **A→B→C is the gate: C may never
score lower than B on Layers 1–3.**

| Flow | A. Today (serial) | B. New serial path (post-change) | C. New parallel path |
|---|---|---|---|
| `/adev:implement` single group | works | must be **identical** | n/a (1 group ⇒ serial) |
| `/adev:implement --parallel`, ≥2 disjoint groups | n/a | serial fallback still valid | groups run in worktrees, merge, **result ≡ serial** |
| `/adev:build --spec` | works | **identical** | n/a |
| `/adev:build --milestone`, independent specs | serial | serial fallback valid | specs build in worktrees, merge in dep order, **result ≡ serial** |
| Issue board under concurrency | single writer | single writer | N writers → CAS retry, **no lost updates** |
| Lifecycle/build/execution state | per-worktree | per-worktree | per-worktree, **no cross-branch pollution** |

Equivalence (`≡`) is defined operationally in §4 Layer 3.

---

## 3. The four-layer graduated eval (0–100)

Scored per the `/adev:eval` harness. Report → `.context-index/evals/worktree-parallelization-eval.md`.

### Layer 1 — Deterministic (25 pts): does the primitive work?
`(gates passed / total) × 25`. **Hard floor: if Layer 1 = 0, total is capped at 25.**

| Gate | Assertion | Status |
|---|---|---|
| Primitive unit tests | `tests/lib/worktree.test.mjs` — 13 cases | ✅ **13/13 passing** |
| Nesting prevention | add from inside a worktree anchors to main root, does not nest | ✅ passing |
| Slug safety | traversal/separator/oversize slugs rejected (`INVALID_SLUG`) | ✅ passing |
| Merge — clean | non-conflicting branch merges; file present at main root | ✅ passing |
| Merge — conflict | conflict detected, `merge --abort` runs, tree left clean, `MERGE_CONFLICT` raised | ✅ passing |
| Idempotency | re-`add` returns `created:false` | ✅ passing |
| CLI contract | `adev worktree <add\|list\|merge\|remove\|guard>` — JSON out, exit codes 0/1 | ✅ smoke-tested; add `tests/cli/worktree.test.mjs` |
| Full suite green | `npm test` unchanged after the additive change | ▢ verify (this run) |
| Parallel implement e2e | rubric `parallel-implement.yaml` required_elements pass | ▢ needs `/adev:implement --parallel` wiring |

### Layer 2 — Architectural conformance (25 pts)
Four sub-dimensions (per eval design):

- **Pattern consistency (0–10):** `lib/worktree.mjs` mirrors `lib/build-state.mjs` (WorktreeError code
  pattern, JSDoc, pure functions); `lib/cli/worktree.mjs` matches the `run({projectRoot,argv})`/`help()`
  driver-substrate contract and `parseArgs` usage. Target ≥ 8.
- **Boundary compliance (0–5):** zero new dependencies (Node built-ins only) ✅; all writes contained
  under `<mainRoot>/.adev/worktrees/` (path-containment asserted) ✅; no hardcoded `~/.claude` paths.
- **Complexity (0–5):** module < 300 LOC, functions single-purpose, no nesting > 3.
- **Test quality (0–5):** tests assert behavior (merge result, tree cleanliness) not internals; both
  happy and conflict/failure paths covered ✅.

### Layer 3 — LLM-as-Judge (25 pts): does parallel ≡ serial in quality?
Five dimensions × 0–5, dispatched to a `reasoning`-tier reviewer with `ultrathink`. Rubric quality
dimensions in `rubrics/parallel-implement.yaml`. Key dimension: **result_equivalence** — the merged
parallel output and the serial baseline must pass the same tests and expose the same public API.
Operational equivalence checks the judge is handed:
1. Same set of tests passes in both branches.
2. `git diff serial-branch parallel-branch -- <impl files>` is empty *or* explained (formatting-only).
3. No file exists in one branch and not the other.

### Layer 4 — Human-in-the-loop (25 pts)
Surface for PASS / ACCEPTABLE / NEEDS_WORK:
1. **Data integrity** — after a parallel milestone build, no work lost, no half-updated issue board,
   no orphaned `adev/*` branches or `tasks.json.lock`.
2. **Failure ergonomics** — when one group fails, the operator report clearly names the retained
   worktree and the merged successes.
3. **Merge-conflict UX** — conflict reports name the exact files (recall `cli/index.mjs` is the
   high-churn hazard from the hygiene work).

**Total = L1 + L2 + L3 + L4.** Ship gate: **≥ 75 (B)** with Layer 1 = 25.

---

## 4. A/B eval — serial vs parallel (token-optimization style)

Runner: `tests/evals/worktree-parallelization/run-ab-eval.mjs` (to build), mirroring
`tests/evals/token-optimization/run-ab-eval.mjs`.

- **Baseline (A):** `/adev:implement` serial on spec S (multi-group plan).
- **Variant (B):** `/adev:implement --parallel` on the same S from a clean checkout.
- **Fixture:** a spec whose plan has ≥2 file-disjoint groups **and** one deliberately overlapping
  group (must fall back to serial for that group).

**Metrics captured** (from session JSONL + git):
| Metric | Baseline | Variant | Pass criterion |
|---|---|---|---|
| Result equivalence | — | — | tests identical; impl diff empty/explained |
| Wall-clock | t_serial | t_parallel | t_parallel < t_serial (else no point) |
| Token cost | from JSONL | from JSONL | variant ≤ 1.15× baseline (isolation overhead bounded) |
| Merge conflicts | 0 | 0 | overlapping group correctly serialized, not force-merged |
| Orphaned state | 0 | 0 | 0 leftover worktrees/branches/locks |

Store results in `results/eval-<date>.md` + `results/last-run.json` (token-optimization convention).

---

## 5. Test matrix

### 5a. Deterministic (`tests/lib/worktree.test.mjs`) — ✅ implemented
detectNesting (3) · worktreePathFor + slug validation (2) · add/list/remove lifecycle (4) ·
nesting prevention (2) · merge clean + conflict (2). **13/13 passing.**

### 5b. CLI contract (`tests/cli/worktree.test.mjs`) — ▢ to add
- each subcommand emits valid JSON on stdout, exit 0
- missing `--slug` → exit 1 + usage on stderr
- unknown subcommand → exit 1
- `guard` from a synthesized `.claude/worktrees/...` cwd → `{nested:true,kind:"harness"}`

### 5c. Integration — shared-state under concurrency (▢ to add)
- **Concurrent board writers:** spawn N processes each doing `issues update` from N worktrees against
  the main-root board; assert all N mutations land (CAS retry), final `seq` = N, no lost update.
- **Per-worktree lifecycle isolation:** emit lifecycle events in two worktrees for two specs; assert
  each `.context-index/lifecycle-state/<slug>.jsonl` stays in its own worktree, no cross-write.
- **Orphan-lock recovery:** pre-create a stale `tasks.json.lock`; assert a worktree writer recovers.

### 5d. End-to-end lifecycle (`tests/integration/cli-lifecycle.test.mjs` extension) — ▢
- **Regression:** serial specify→review→plan→implement→validate projection reaches `validated`
  **unchanged** (the guard against breaking the main use).
- **Parallel:** same flow with `--parallel`; projection reaches `validated`; merged tree passes gates.

### 5e. Negative / safety (▢)
- add with dirty target path → clean error
- merge with conflict → abort + tree clean (covered in 5a; also assert at CLI layer)
- remove non-existent slug → `REMOVE_FAILED`, exit 1
- interrupted run (kill between add and merge) → `adev worktree list` still enumerates; `remove --force` recovers

---

## 6. Prototype status (built in this session)

| Artifact | State |
|---|---|
| `lib/worktree.mjs` | ✅ implemented — add/list/merge/remove/guard, `resolveMainRoot`, `detectNesting`, slug validation, `WorktreeError` |
| `lib/cli/worktree.mjs` | ✅ implemented — `run()`/`help()` contract, `parseArgs`, JSON out |
| `cli/index.mjs` registry | ✅ `["worktree", …]` registered |
| `tests/lib/worktree.test.mjs` | ✅ 13/13 passing (incl. nesting prevention + conflict abort) |
| `rubrics/parallel-implement.yaml` | ✅ this plan |
| `/adev:implement --parallel` wiring | ▢ **not yet** — the consumer that reads plan `## Parallelization` groups and drives add→dispatch→merge→remove |
| `run-ab-eval.mjs` | ▢ not yet |
| CLI + integration tests (5b–5e) | ▢ not yet |

**Verified manually:** full add → commit-in-worktree → add-from-inside-worktree (no nesting) →
merge → remove cycle, plus conflict detection with clean abort.

---

## 7. How to run

```bash
# Layer 1 — the primitive
node --test tests/lib/worktree.test.mjs

# Full regression (main uses unaffected)
npm test

# A/B eval (once run-ab-eval.mjs exists)
node tests/evals/worktree-parallelization/run-ab-eval.mjs

# Graduated eval on a real spec (once --parallel is wired)
adev eval --spec .context-index/specs/features/<mod>/<spec>.spec.md
```

## 8. Risks the plan explicitly targets

1. **Nesting** — the original reason skills banned worktree isolation. Neutralized by anchoring to
   `--git-common-dir` (tested). Guard reports `nested` so orchestrators can fall back to serial.
2. **Merge conflicts on high-churn shared files** (`cli/index.mjs`). Gated by the plan's file-overlap
   analysis: only disjoint groups parallelize; overlapping → serial. Conflict path aborts cleanly.
3. **Lost issue-board updates** — mitigated by the existing CAS lock; §5c proves it under N writers.
4. **Orphaned worktrees/branches/locks** — Layer 4 + §5e assert clean teardown and recovery.
