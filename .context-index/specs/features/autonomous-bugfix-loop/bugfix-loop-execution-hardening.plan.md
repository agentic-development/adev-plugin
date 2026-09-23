# Implementation Plan: Bugfix Loop Execution Hardening

> **Methodology:** adev
> **Charter:** .context-index/specs/features/autonomous-bugfix-loop/charter.md
> **Spec:** .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-execution-hardening.spec.md
> **Review:** PASS_WITH_NOTES (2026-08-21)
> **Platform:** Node.js (ESM), JavaScript, `node:test`, npm — no framework, CLI/plugin target

**Goal:** Harden `/adev:bugfix-loop` with a branch-freshness guard, per-bug worktree isolation, automated commit/PR on `FIXED` verdicts, a running summary table, and a configurable `--max-priority` band — resolving the five problems (staleness discovered late, cross-bug diff contamination, no commit/PR automation, no progress visibility, hardcoded `P3`) documented in the spec's Current State.

**Architecture:** Five independent-where-possible migration steps, each adding a new `lib/` module (or extending an existing one) plus a matching `adev bugfix-loop <verb>` CLI subcommand, wired into `skills/bugfix-loop/SKILL.md` as a named verb invocation (never inline Node, per the `cli-driver-surface` charter). Worktree isolation reuses the already-shipped `lib/worktree.mjs` primitive (`worktree-primitive.spec.md`) unmodified — no second worktree implementation is introduced. Commit/PR automation shells out via `execFile`/`spawn` argv arrays only, and refuses (never sanitizes) WorkItem-derived content unsafe for a commit-message/branch-name/PR-title context (BEH-11), consistent with this repo's existing refuse-not-sanitize posture in `lib/extensions/governance-values.mjs` and `lib/extensions/exec-payload.mjs`. `--max-priority` threading depends on `bug-selection-and-eligibility-rev-8-configurable-priority-floor.spec.md`, which has already shipped: `lib/issues/eligibility.mjs`'s `resolvePriorityBound()` already accepts the full `P0`-`P4` range and `lib/cli/issues-next.mjs` already prints the BEH-12 excluded-module set to stderr for `P0`/`P1` — Task 14 below is skill-layer wiring only, no verb-layer change required.

---

## File Structure

**Create:**
- `lib/bugfix-loop-freshness.mjs` — `git fetch` + ahead/behind computation against `origin/<default-branch>`
- `lib/bugfix-loop-commit.mjs` — safe-character validation (refuse-not-sanitize) + commit/push/`gh pr create` via argv-array subprocess calls
- `tests/lib/bugfix-loop-freshness.test.mjs` — freshness computation + degrade-path unit tests
- `tests/lib/bugfix-loop-commit.test.mjs` — commit/PR happy path (mocked), degrade paths, argv-safety/refusal adversarial tests
- `tests/integration/bugfix-loop-commit-pr-live.test.mjs` — real (non-mocked) `git`/`gh` happy-path test, `ci_tag: integration`-style (name-pattern-gated, excluded from default `npm test`); fails hard (never skips) when its infra is missing

**Modify:**
- `lib/bugfix-loop-run.mjs` — add `starting_branch`, `last_worktree_branch`, `summary_rows[]` fields + `resolveWorktreeBaseRef`/`appendSummaryRow`/`formatSummaryTable` helpers
- `lib/cli/bugfix-loop.mjs` — add `check-freshness`, `commit-pr` subcommands; extend `create` (`--starting-branch`), `guard` (emit `worktree_base_ref`), `record-attempt` (`--files-touched`/`--tests-added`/`--priority-bound`, table print)
- `skills/bugfix-loop/SKILL.md` — Step 0/1 freshness guard + fail-fast `--max-priority` validation; new `--worktree-per-bug`/`--auto-commit`/`--max-priority` args; Step 2 uses resolved `--max-priority`; Step 3 worktree add; new Step 4.5; Step 4 summary-table print; Step 5 finish reprints table; Step 6 worktree remove + manual `--resume` orphan sweep
- `docs/cli-reference.md` — `bugfix-loop` verb section: `check-freshness`, `commit-pr`, updated `create`/`guard`/`record-attempt` signatures
- `docs/skill-reference.md` — `/adev:bugfix-loop` entry: `--worktree-per-bug`, `--auto-commit`, `--max-priority` arguments
- `templates/manifest-template.yaml` — document `tasks.bugfix_loop.freshness.{soft_threshold,hard_threshold}` (commented, matching the existing `attempt_cap`/`excluded_modules` documentation convention)
- `tests/lib/bugfix-loop-run.test.mjs` — extend for new run-state fields/helpers
- `tests/cli/bugfix-loop.test.mjs` — extend for new/extended subcommands
- `tests/skills/bugfix-loop-skill.test.mjs` — extend for new Step 0/1/3/4/4.5/5/6 structural assertions
- `tests/integration/bugfix-loop-loop.test.mjs` — extend for worktree isolation, stacking, summary table, and `--max-priority` passthrough

**Reference (read, do not modify):**
- `lib/worktree.mjs` — the reused worktree primitive (`add`/`remove`/`resolveMainRoot`/`detectNesting`/`SLUG_RE`)
- `lib/issues/eligibility.mjs` — already-shipped `resolvePriorityBound()`/BEH-12 excluded-module stderr print
- `lib/cli/issues-next.mjs` — already-shipped `--max-priority` verb-layer wiring (Task 14 threads the skill into this, unchanged)
- `lib/extensions/governance-values.mjs`, `lib/extensions/exec-payload.mjs` — refuse-not-sanitize pattern reference for BEH-11
- `lib/cli/tracker-sync.mjs`, `lib/tracker-provider-bridge/outbound-writeback.mjs` — degrade-gracefully pattern reference for `gh`/network failures
- `lib/cli/coordination.mjs` (`resolveDefaultRemoteBranch`, lines 191-198) — pattern reference for resolving `origin/<default-branch>` via `git symbolic-ref --quiet --short refs/remotes/origin/HEAD`
- `lib/cli/worktree.mjs` — existing `adev worktree add|remove` CLI flag shapes (`--slug`, `--base`, `--force`, `--delete-branch`)
- `.context-index/adrs/0015-lifecycle-state-dual-format-coexistence.md` — registers `bugfix-loop-runs-<run_id>.json` as a single-JSON-snapshot artifact; new fields do not change its format/ownership, no ADR update needed

---

## Context Packets

### Task 1 Context
- Spec: `bugfix-loop-execution-hardening.spec.md` (BEH-1, BEH-2, Error Cases row "origin unreachable... FRESHNESS_CHECK_DEGRADED")
- Charter: `.context-index/specs/features/autonomous-bugfix-loop/charter.md` (capability: `/adev:bugfix-loop` Skill)
- Source files: `lib/cli/coordination.mjs:191-198` (default-branch resolution pattern), `lib/errors.mjs` (`codedError`)
- Constitution: Principle 1 (Node built-ins only — `child_process`)

### Task 2 Context
- Spec: BEH-1, BEH-2, Error Cases (`FRESHNESS_CHECK_DEGRADED`, `BRANCH_STALE_BLOCKED`)
- Source files: `lib/bugfix-loop-freshness.mjs` (Task 1, full read), `lib/cli/bugfix-loop.mjs` (existing subcommand shape, full read)
- Reference: `templates/manifest-template.yaml:250-276` (existing `tasks.bugfix_loop.*` documentation convention to extend)

### Task 3 Context
- Spec: BEH-1, BEH-2
- Source files: `skills/bugfix-loop/SKILL.md` Step 0/1 (full read), `lib/cli/bugfix-loop.mjs` `check-freshness` output shape (Task 2)
- Sample: none — the skill is markdown-only; follow the existing `adev bugfix-loop guard`/`adev tracker-sync inbound` call-and-branch pattern already in Step 0/1

### Task 4 Context
- Spec: Migration Path Step 2 ("`<ref>` is the loop's starting branch for the first bug... previous bug's completed branch for every subsequent bug")
- Source files: `lib/bugfix-loop-run.mjs` (full read — `createRun`, `writeRunState`, `atomicWriteJson` pattern)
- ADR: `.context-index/adrs/0015-lifecycle-state-dual-format-coexistence.md` (decision + rationale — confirms this file stays a single-JSON-snapshot artifact)

### Task 5 Context
- Spec: BEH-3 (`<ref>` resolution)
- Source files: `lib/cli/bugfix-loop.mjs` (full read), `lib/bugfix-loop-run.mjs` (Task 4 additions)

### Task 6 Context
- Spec: BEH-3, Error Cases (`ADD_FAILED`)
- Source files: `skills/bugfix-loop/SKILL.md` Step 3 (full read), `lib/worktree.mjs` `add()` (export signature + `ADD_FAILED` error shape), `lib/cli/worktree.mjs` (`add --slug <s> --base <ref>` flag shape)
- Cross-cutting: `worktree-parallelization/worktree-primitive.spec.md` (SLUG_RE, main-root anchoring, idempotent add)

### Task 7 Context
- Spec: BEH-8, BEH-13, Error Cases (`WORKTREE_REMOVAL_DEFERRED`, `REMOVE_FAILED`)
- Source files: `skills/bugfix-loop/SKILL.md` Step 5/6 and the manual `--resume` path (full read), `lib/worktree.mjs` `remove()`/`list()` (export signatures + `REMOVE_FAILED` shape)
- Cross-cutting: `worktree-parallelization/worktree-primitive.spec.md` (remove semantics, `deleteBranch`)

### Task 8 Context
- Spec: BEH-11, Error Cases (`UNSAFE_COMMIT_CONTENT`)
- Source files: `lib/extensions/governance-values.mjs:210-225` (`assertSafeArgvToken` — pattern reference, not reused directly: commit-message/branch-name/PR-title validation is a distinct allowlist shape from argv-token validation), `lib/errors.mjs` (`refuse`)
- Dependency note (spec): `tracker-provider-bridge.spec.md`'s Interaction Contract fences `notes` but not `title` — `title` is the primary untrusted-content surface here

### Task 9 Context
- Spec: BEH-4, BEH-5, BEH-7, Error Cases (`COMMIT_PR_SKIPPED`)
- Source files: `lib/bugfix-loop-commit.mjs` (Task 8, full read), `lib/worktree.mjs` (branch-naming convention `adev/<slug>`, reused for `adev/bugfix-<issue-id>`)
- Reference: `lib/tracker-provider-bridge/outbound-writeback.mjs` (degrade-gracefully-on-external-dependency-failure pattern)
- Constitution: commit trailer policy (`Spec:`/`Issue:` trailers required)

### Task 10 Context
- Spec: BEH-4, BEH-5, BEH-7
- Source files: `lib/cli/bugfix-loop.mjs` (full read), `lib/bugfix-loop-commit.mjs` (Task 9), `lib/bugfix-loop-run.mjs` `last_worktree_branch` write-back (Task 4)

### Task 11 Context
- Spec: BEH-4, BEH-5, Migration Path Step 3
- Source files: `skills/bugfix-loop/SKILL.md` Step 4 (full read, insertion point for new Step 4.5), `lib/cli/bugfix-loop.mjs` `commit-pr` output shape (Task 10)

### Task 12 Context
- Spec: BEH-6
- Source files: `lib/bugfix-loop-run.mjs` (full read, Task 4's additions already in place)

### Task 13 Context
- Spec: BEH-6, Migration Path Step 4 (`--files-touched`/`--tests-added` computed via `git diff --stat`)
- Source files: `lib/cli/bugfix-loop.mjs` (full read), `lib/bugfix-loop-run.mjs` (Task 12), `skills/bugfix-loop/SKILL.md` Step 4/5 (full read)

### Task 14 Context
- Spec: BEH-9, BEH-10, BEH-12, Error Cases (`INVALID_PRIORITY_BOUND`, transitional row)
- Source files: `lib/issues/eligibility.mjs:26-51` (`PRIORITY_LABEL_TO_NUMBER`, `resolvePriorityBound`), `lib/cli/issues-next.mjs` (full read — already prints BEH-12 stderr), `skills/bugfix-loop/SKILL.md` Step 0/1/2/4 (full read)
- Sibling spec: `bug-selection-and-eligibility-rev-8-configurable-priority-floor.spec.md` (already implemented — confirms BEH-8 amendment landed)

### Task 15 Context
- Spec: full document (Changes Catalog MODIFIED list for `docs/cli-reference.md`/`docs/skill-reference.md`)
- Source files: `docs/cli-reference.md:659-692` (existing `next`/`bugfix-loop`/`tracker-sync` sections), `docs/skill-reference.md:464-488` (existing `/adev:bugfix-loop` entry)

### Task 16 Context
- Spec: Migration Path Step 2 Verification, BEH-3, BEH-6, BEH-9
- Source files: `tests/integration/bugfix-loop-loop.test.mjs` (full read — existing harness/fixture pattern)

---

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: A universal coverage claim must ship with the predicate that checks it (confidence: medium)
- **Pattern:** When closing a coverage gap in a spec or acceptance criterion, state the executable check alongside the claim — the exact command or match, and the paths it runs over.
- **Anti-pattern:** Answer a repeatedly-missed surface by widening the assertion to an unbounded universal that cannot be discharged.
- **Evidence:** 1 observation

### Heuristic: Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- **Pattern:** When evaluating token consumption of adev skills, parse real session JSONL rather than estimating from byte counts.
- **Anti-pattern:** Estimate tokens using bytes/4 heuristics.
- **Evidence:** 1 observation

### Heuristic: Cache reads dominate session cost — minimize context accumulation (confidence: medium)
- **Pattern:** Focus on reducing what accumulates in conversation context; every output token persists as a cache read on all later turns.
- **Anti-pattern:** Focus on reducing input token counts alone.
- **Evidence:** 1 observation

---

## Parallelization

- Group A (sequential, freshness): Task 1 → Task 2 → Task 3
- Group B (sequential, worktree run-state/CLI/skill): Task 4 → Task 5 → Task 6 → Task 7
- Group C (sequential, commit lib/CLI/skill): Task 8 → Task 9 → Task 10 → Task 11
- Group D (sequential, summary table): Task 12 → Task 13
- Task 14 depends on Task 13 (reuses `--priority-bound`)
- Task 15 (docs) depends on Tasks 2, 3, 6, 7, 10, 11, 13, 14
- Task 16 (integration verification) depends on Tasks 7, 11, 13, 14

Tasks 1, 4, 8, and 12 touch disjoint files (`lib/bugfix-loop-freshness.mjs`, `lib/bugfix-loop-run.mjs`, `lib/bugfix-loop-commit.mjs`, `lib/bugfix-loop-run.mjs` again) and could start in parallel — note Task 4 and Task 12 both land in `lib/bugfix-loop-run.mjs`, so within Group B/D those two must not run concurrently with each other even though they could each start before Group A/C finish. `skills/bugfix-loop/SKILL.md` is touched by Tasks 3, 6, 7, 11, 13, 14 — these must serialize on that file even though their underlying `lib/` work (Groups A-D) can otherwise proceed independently. `lib/cli/bugfix-loop.mjs` is touched by Tasks 2, 5, 10, 13 — same constraint. In practice: run Task 1/4/8/12 concurrently first (four independent `lib/` modules), then serialize the rest per-group as file contention on `lib/cli/bugfix-loop.mjs` and `skills/bugfix-loop/SKILL.md` dictates.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Branch-freshness computation | medium | unit | — | 2 create |
| 2 | `check-freshness` CLI verb | small | unit | Task 1 | 0 create, 2 modify |
| 3 | Wire freshness guard into SKILL.md Step 0/1 | small | unit | Task 2 | 0 create, 1 modify |
| 4 | Run-state worktree base-ref fields | small | unit | — | 0 create, 1 modify |
| 5 | Extend `create`/`guard` CLI for worktree base-ref | small | unit | Task 4 | 0 create, 1 modify |
| 6 | Wire `--worktree-per-bug` worktree add + claim into Step 3 | medium | unit | Task 5 | 0 create, 1 modify |
| 7 | Wire worktree remove + crash-recovery sweep into Step 4.5/5/6 | medium | unit | Task 6 | 0 create, 1 modify |
| 8 | Commit-content safe-character validation (BEH-11) | medium | unit | — | 2 create |
| 9 | Commit + push + `gh pr create` (argv-array, stacked base) | large | unit | Task 8 | 1 create, 1 modify |
| 10 | `commit-pr` CLI verb wiring | small | unit | Task 9, Task 5 | 0 create, 1 modify |
| 11 | Wire Step 4.5 (new) into SKILL.md | small | unit | Task 10, Task 7 | 0 create, 1 modify |
| 12 | Run-state `summary_rows[]` + formatting helpers | small | unit | — | 0 create, 1 modify |
| 13 | Extend `record-attempt` CLI + wire summary table into Step 4/5 | medium | unit | Task 12 | 0 create, 2 modify |
| 14 | Wire `--max-priority` fail-fast validation + threading | small | unit | Task 13 | 0 create, 1 modify |
| 15 | Update `docs/cli-reference.md` + `docs/skill-reference.md` | small | unit | Tasks 2,3,6,7,10,11,13,14 | 0 create, 2 modify |
| 16 | Integration verification: isolation, stacking, table, priority band | medium | unit | Tasks 7,11,13,14 | 0 create, 1 modify |

---

## Task 1: Branch-Freshness Computation [specialist: none]

**Charter capability:** `/adev:bugfix-loop` Skill (execution-hardening extension)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/bugfix-loop-freshness.mjs`
- Test: `tests/lib/bugfix-loop-freshness.test.mjs`

**Tests:** `tests/lib/bugfix-loop-freshness.test.mjs` — create.

**Context to load:**
- `lib/cli/coordination.mjs:191-198` (default-branch resolution pattern to mirror)
- `lib/errors.mjs` (`codedError`)
- Spec BEH-1, BEH-2, and the Error Cases row for `FRESHNESS_CHECK_DEGRADED`

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert';
import { computeFreshness } from '../../lib/bugfix-loop-freshness.mjs';

test('computeFreshness returns ahead/behind counts against a fixture repo with a known-behind branch', async () => {
  // build a temp git repo with an "origin" remote (a second local bare/dir repo),
  // put local HEAD N commits behind origin/main, assert { degraded: false, ahead, behind }
});

test('computeFreshness degrades gracefully when origin is unreachable', async () => {
  // point origin at a non-existent path; assert { degraded: true, reason }, never throws
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/bugfix-loop-freshness.test.mjs`
Expected: FAIL — `Cannot find module '../../lib/bugfix-loop-freshness.mjs'`

- [ ] **Implement**

```javascript
// lib/bugfix-loop-freshness.mjs
import { execFileSync } from 'node:child_process';

export function resolveDefaultRemoteBranch(cwd) { /* mirrors coordination.mjs:191-198 */ }

export function computeFreshness({ cwd, defaultBranch } = {}) {
  // git fetch origin <branch>; git rev-list --left-right --count origin/<branch>...HEAD
  // ANY failure (unreachable origin, detached HEAD, malformed output) → { degraded: true, reason }
  // never throws — Error Cases row is a total degrade path, not scoped to origin-unreachable only
}
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/bugfix-loop-freshness.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch (if not already created): `feat/autonomous-bugfix-loop/bugfix-loop-execution-hardening`

```bash
git add lib/bugfix-loop-freshness.mjs tests/lib/bugfix-loop-freshness.test.mjs
git commit -m "feat(bugfix-loop): add branch-freshness computation

Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-execution-hardening.spec.md
Plan-task: 1"
```

---

## Task 2: `check-freshness` CLI Verb [specialist: none]

**Charter capability:** `/adev:bugfix-loop` Skill
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `lib/cli/bugfix-loop.mjs` — add `check-freshness` subcommand
- Modify: `templates/manifest-template.yaml:250-276` — document `tasks.bugfix_loop.freshness.{soft_threshold,hard_threshold}` (commented, default warn-only)
- Test: `tests/cli/bugfix-loop.test.mjs`

**Tests:** `tests/cli/bugfix-loop.test.mjs` — extend.

**Context to load:**
- `lib/bugfix-loop-freshness.mjs` (Task 1, full read)
- `lib/cli/bugfix-loop.mjs` existing subcommand shape (full read — mirror the `create`/`guard` pattern: `parseArgs`, `--json`, numeric exit codes)
- Spec BEH-1, BEH-2, Error Cases (`FRESHNESS_CHECK_DEGRADED`, `BRANCH_STALE_BLOCKED`)

- [ ] **Write failing test**

```javascript
test('adev bugfix-loop check-freshness warns (does not block) above soft threshold, blocks above hard threshold', () => {
  // fixture repo behind origin by a controlled count; assert JSON { status: "warn"|"blocked"|"ok", ahead, behind }
});
test('adev bugfix-loop check-freshness degrades to a warning JSON when origin is unreachable, never exits non-zero', () => {
  // assert { status: "degraded", reason } and exit code 0
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/bugfix-loop.test.mjs`
Expected: FAIL — `unknown subcommand: check-freshness`

- [ ] **Implement**

Add a `check-freshness` branch to `lib/cli/bugfix-loop.mjs`'s `run()`, resolving `tasks.bugfix_loop.freshness.soft_threshold`/`hard_threshold` from `manifest` (default: warn-only, no hard block until an operator opts in), calling `computeFreshness()` from Task 1, and mapping the result onto `{ status: "ok"|"warn"|"blocked"|"degraded", ahead, behind, reason? }`.

- [ ] **Verify test passes**

Run: `node --test tests/cli/bugfix-loop.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/bugfix-loop.mjs templates/manifest-template.yaml tests/cli/bugfix-loop.test.mjs
git commit -m "feat(bugfix-loop): add check-freshness CLI verb

Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-execution-hardening.spec.md
Plan-task: 2"
```

---

## Task 3: Wire Freshness Guard into SKILL.md Step 0/1 [specialist: none]

**Charter capability:** `/adev:bugfix-loop` Skill
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `skills/bugfix-loop/SKILL.md` — Step 0/1
- Test: `tests/skills/bugfix-loop-skill.test.mjs`

**Tests:** `tests/skills/bugfix-loop-skill.test.mjs` — extend.

**Context to load:**
- `skills/bugfix-loop/SKILL.md` Step 0/1 (full read — insertion point, before the existing status/budget guard)
- `lib/cli/bugfix-loop.mjs` `check-freshness` output shape (Task 2)

- [ ] **Write failing test**

```javascript
test('SKILL.md Step 0/1 calls adev bugfix-loop check-freshness before the status/budget guard', () => {
  const text = readFileSync('skills/bugfix-loop/SKILL.md', 'utf8');
  assert.match(text, /adev bugfix-loop check-freshness/);
  // assert ordering: check-freshness call appears before `adev bugfix-loop guard`
});
test('SKILL.md documents BRANCH_STALE_BLOCKED halting before bug selection', () => {
  assert.match(text, /BRANCH_STALE_BLOCKED/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/bugfix-loop-skill.test.mjs`
Expected: FAIL — pattern not found

- [ ] **Implement**

Add the `check-freshness` call to Step 0/1, printing a warning naming ahead/behind counts on soft-threshold breach (BEH-1, non-halting) and halting to Step 5 with `--status blocked` naming the freshness gap on hard-threshold breach (BEH-2). Degrade (`FRESHNESS_CHECK_DEGRADED`) prints a logged warning and proceeds.

- [ ] **Verify test passes**

Run: `node --test tests/skills/bugfix-loop-skill.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/bugfix-loop/SKILL.md tests/skills/bugfix-loop-skill.test.mjs
git commit -m "feat(bugfix-loop): wire freshness guard into Step 0/1

Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-execution-hardening.spec.md
Plan-task: 3"
```

---

## Task 4: Run-State Worktree Base-Ref Fields [specialist: none]

**Charter capability:** `/adev:bugfix-loop` Skill
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/bugfix-loop-run.mjs` — add `starting_branch`, `last_worktree_branch` fields to `createRun`'s initial state; add `resolveWorktreeBaseRef(state)` and `recordWorktreeBranch(projectRoot, runId, branch)` exports
- Test: `tests/lib/bugfix-loop-run.test.mjs`

**Tests:** `tests/lib/bugfix-loop-run.test.mjs` — extend.

**Context to load:**
- `lib/bugfix-loop-run.mjs` (full read — mirror `appendAttempt`/`completeTurn`'s read-mutate-write shape)
- Spec Migration Path Step 2 (`<ref>` resolution: starting branch for first bug, previous bug's completed branch afterward)

- [ ] **Write failing test**

```javascript
test('createRun accepts startingBranch and persists it; resolveWorktreeBaseRef falls back to it when last_worktree_branch is null', () => {
  const state = createRun(projectRoot, { startingBranch: 'main' });
  assert.equal(state.starting_branch, 'main');
  assert.equal(resolveWorktreeBaseRef(state), 'main');
});
test('recordWorktreeBranch updates last_worktree_branch; resolveWorktreeBaseRef then prefers it over starting_branch', () => {
  recordWorktreeBranch(projectRoot, state.run_id, 'adev/bugfix-issue-1');
  const updated = readRunState(projectRoot, state.run_id);
  assert.equal(resolveWorktreeBaseRef(updated), 'adev/bugfix-issue-1');
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/bugfix-loop-run.test.mjs`
Expected: FAIL — `startingBranch` unset / `resolveWorktreeBaseRef`/`recordWorktreeBranch` not exported

- [ ] **Implement**

```javascript
export function createRun(projectRoot, { maxBugs = null, maxTurns = 20, startingBranch = null } = {}) {
  // ...existing fields..., starting_branch: startingBranch, last_worktree_branch: null,
}
export function resolveWorktreeBaseRef(state) {
  return state.last_worktree_branch ?? state.starting_branch;
}
export function recordWorktreeBranch(projectRoot, runId, branch) {
  const state = readRunState(projectRoot, runId);
  state.last_worktree_branch = branch;
  return writeRunState(projectRoot, state);
}
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/bugfix-loop-run.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/bugfix-loop-run.mjs tests/lib/bugfix-loop-run.test.mjs
git commit -m "feat(bugfix-loop): add worktree base-ref fields to run-state

Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-execution-hardening.spec.md
Plan-task: 4"
```

---

## Task 5: Extend `create`/`guard` CLI for Worktree Base-Ref [specialist: none]

**Charter capability:** `/adev:bugfix-loop` Skill
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 4
**Files:**
- Modify: `lib/cli/bugfix-loop.mjs` — `create` accepts `--starting-branch`; `guard`'s JSON output always includes `worktree_base_ref`
- Test: `tests/cli/bugfix-loop.test.mjs`

**Tests:** `tests/cli/bugfix-loop.test.mjs` — extend.

**Context to load:**
- `lib/cli/bugfix-loop.mjs` (full read)
- `lib/bugfix-loop-run.mjs` (Task 4's `resolveWorktreeBaseRef`)

- [ ] **Write failing test**

```javascript
test('adev bugfix-loop create --starting-branch main persists starting_branch', () => { /* ... */ });
test('adev bugfix-loop guard --json always includes worktree_base_ref, even on proceed:true', () => { /* ... */ });
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/bugfix-loop.test.mjs`
Expected: FAIL — `starting_branch` absent / `worktree_base_ref` missing from guard JSON

- [ ] **Implement**

Wire `--starting-branch` through `create`'s `parseArgs` options into `createRun({ startingBranch })`. In `guard`, after computing `statusResult`/`budget`, always attach `worktree_base_ref: resolveWorktreeBaseRef(state)` to whichever result object is returned.

- [ ] **Verify test passes**

Run: `node --test tests/cli/bugfix-loop.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/bugfix-loop.mjs tests/cli/bugfix-loop.test.mjs
git commit -m "feat(bugfix-loop): thread worktree base-ref through create/guard

Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-execution-hardening.spec.md
Plan-task: 5"
```

---

## Task 6: Wire `--worktree-per-bug` into SKILL.md Step 3 [specialist: none]

**Charter capability:** `/adev:bugfix-loop` Skill
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 5
**Files:**
- Modify: `skills/bugfix-loop/SKILL.md` — Arguments section (`--worktree-per-bug`, `--auto-commit`) + Step 3
- Test: `tests/skills/bugfix-loop-skill.test.mjs`

**Tests:** `tests/skills/bugfix-loop-skill.test.mjs` — extend.

**Context to load:**
- `skills/bugfix-loop/SKILL.md` Step 3 (full read)
- `lib/cli/worktree.mjs` (`add --slug <s> --base <ref>` flag shape)
- Spec BEH-3, Error Cases `ADD_FAILED`

**Flag-name reconciliation (plan-review finding):** the spec's own prose (BEH-3, Migration Path Step 2, Improvement 2) repeatedly writes `adev worktree add --slug bugfix-<issue-id> --base-ref <ref>`. `--base-ref` does not exist on the real CLI — `lib/cli/worktree.mjs` only accepts `--base <ref>` (confirmed by reading the file: `add --slug <s> [--base <ref>]`, wired to `opts.base`). Use the actual flag, `--base`, in both the test and the SKILL.md text this task writes. Do not follow the spec's `--base-ref` wording literally — it is a spec-prose error, not a second, real flag.

- [ ] **Write failing test**

```javascript
test('SKILL.md documents --worktree-per-bug and --auto-commit arguments, default OFF', () => { /* ... */ });
test('Step 3 calls adev worktree add --slug bugfix-<issue-id> --base <ref> before claim, when --worktree-per-bug is set', () => { /* ... */ });
test('Step 3 documents ADD_FAILED handling: release claim, no attempt this turn, continue to Step 2', () => { /* ... */ });
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/bugfix-loop-skill.test.mjs`
Expected: FAIL — patterns not found

- [ ] **Implement**

Add `--worktree-per-bug`/`--auto-commit` to the Arguments section (default OFF). In Step 3, before the claim call, when `--worktree-per-bug` is set: read `worktree_base_ref` from the Step 1 `guard --json` result (Task 5), call `adev worktree add --slug bugfix-<id> --base <ref>`, and run the claim + Step 4 attempt inside that worktree's path. On `ADD_FAILED`, release no lease change, skip this bug for the turn, and go to Step 2 for the next-eligible bug (mirrors the existing 3-retry claim-failure path).

- [ ] **Verify test passes**

Run: `node --test tests/skills/bugfix-loop-skill.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/bugfix-loop/SKILL.md tests/skills/bugfix-loop-skill.test.mjs
git commit -m "feat(bugfix-loop): wire --worktree-per-bug into Step 3

Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-execution-hardening.spec.md
Plan-task: 6"
```

---

## Task 7: Wire Worktree Remove + Crash-Recovery Sweep [specialist: none]

**Charter capability:** `/adev:bugfix-loop` Skill
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 6
**Files:**
- Modify: `skills/bugfix-loop/SKILL.md` — Step 6 + manual `--resume` path
- Test: `tests/skills/bugfix-loop-skill.test.mjs`

**Tests:** `tests/skills/bugfix-loop-skill.test.mjs` — extend.

**Context to load:**
- `skills/bugfix-loop/SKILL.md` Step 6 and the manual `--resume` path (full read)
- `lib/worktree.mjs` `remove()`/`list()` (Error shape `REMOVE_FAILED`)
- Spec BEH-8, BEH-13, Error Cases `WORKTREE_REMOVAL_DEFERRED`, `REMOVE_FAILED`

- [ ] **Write failing test**

```javascript
test('Step 6 calls adev worktree remove --slug bugfix-<issue-id> after commit (or explicit skip) is confirmed', () => { /* ... */ });
test('Step 6 documents REMOVE_FAILED as non-blocking advisory — never retried, never blocks self-re-invocation', () => { /* ... */ });
test('the manual --resume path (no --resume-run-id) performs the same orphan-worktree sweep as Step 6 (BEH-13)', () => { /* ... */ });
test('Step 6 documents WORKTREE_REMOVAL_DEFERRED: an uncommitted diff (commit-pr skipped) leaves the worktree in place, logging its path, instead of removing it', () => {
  const text = readFileSync('skills/bugfix-loop/SKILL.md', 'utf8');
  assert.match(text, /WORKTREE_REMOVAL_DEFERRED/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/bugfix-loop-skill.test.mjs`
Expected: FAIL — patterns not found

- [ ] **Implement**

In Step 6, when `--worktree-per-bug` was active for the just-completed bug, call `adev worktree remove --slug bugfix-<issue-id>` once the commit (or explicit skip) is confirmed. On `REMOVE_FAILED`, log as non-blocking advisory and self-re-invoke anyway (never retry, never block). On a deliberate uncommitted-diff skip, do not remove — leave the worktree, log its path (`WORKTREE_REMOVAL_DEFERRED`). Add the same single-attempt sweep to the manual `--resume`-without-`--resume-run-id` path (BEH-13), gated on `--worktree-per-bug` having been active in the recovered run.

- [ ] **Verify test passes**

Run: `node --test tests/skills/bugfix-loop-skill.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/bugfix-loop/SKILL.md tests/skills/bugfix-loop-skill.test.mjs
git commit -m "feat(bugfix-loop): wire worktree removal and crash-recovery sweep

Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-execution-hardening.spec.md
Plan-task: 7"
```

---

## Task 8: Commit-Content Safe-Character Validation (BEH-11) [specialist: none]

**Charter capability:** `/adev:bugfix-loop` Skill
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/bugfix-loop-commit.mjs` (validation function only in this task)
- Test: `tests/lib/bugfix-loop-commit.test.mjs`

**Tests:** `tests/lib/bugfix-loop-commit.test.mjs` — create.

**Context to load:**
- `lib/extensions/governance-values.mjs:210-225` (pattern reference — the shape of a refuse-not-sanitize allowlist check, not directly reused: a git ref/commit-message allowlist has different valid characters than an argv token)
- `lib/errors.mjs` (`refuse`)
- Spec BEH-11, Error Cases `UNSAFE_COMMIT_CONTENT`

- [ ] **Write failing test**

```javascript
import { validateCommitContent } from '../../lib/bugfix-loop-commit.mjs';

test('validateCommitContent accepts an ordinary WorkItem title', () => {
  assert.equal(validateCommitContent('Fix null pointer in parser'), true);
});
test('validateCommitContent refuses shell-metacharacter content: ; rm -rf, backticks, $(...)', () => {
  for (const unsafe of ['; rm -rf /', '`whoami`', '$(cat /etc/passwd)']) {
    assert.equal(validateCommitContent(unsafe), false);
  }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/bugfix-loop-commit.test.mjs`
Expected: FAIL — `Cannot find module '../../lib/bugfix-loop-commit.mjs'`

- [ ] **Implement**

```javascript
// lib/bugfix-loop-commit.mjs
const SAFE_COMMIT_CONTENT = /^[\w\s.,:;'"()/#!?-]+$/;

export function validateCommitContent(text) {
  return typeof text === 'string' && text.length > 0 && text.length <= 200 && SAFE_COMMIT_CONTENT.test(text);
}

export function safeCommitMessage(issueId, title, notes) {
  // refuse (not sanitize) unsafe title/notes; fall back to a generic
  // templated message keyed only by issue id — never a partially-cleaned one
}
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/bugfix-loop-commit.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/bugfix-loop-commit.mjs tests/lib/bugfix-loop-commit.test.mjs
git commit -m "feat(bugfix-loop): add commit-content safe-character validation (BEH-11)

Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-execution-hardening.spec.md
Plan-task: 8"
```

---

## Task 9: Commit + Push + `gh pr create` [specialist: none]

**Charter capability:** `/adev:bugfix-loop` Skill
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 8
**Files:**
- Modify: `lib/bugfix-loop-commit.mjs` — add `commitAndOpenPr()`
- Test: `tests/lib/bugfix-loop-commit.test.mjs`
- Test: `tests/integration/bugfix-loop-commit-pr-live.test.mjs` (new — the real, non-mocked happy-path test the spec's Step 3 Verification requires)

**Tests:** `tests/lib/bugfix-loop-commit.test.mjs` — extend (mocked unit coverage). `tests/integration/bugfix-loop-commit-pr-live.test.mjs` — create (real `git`/`gh` happy path, per spec Migration Path Step 3 Verification: *"a real (non-mocked) integration test behind the existing `ci_tag: integration` gate for the happy path"*).

**Context to load:**
- `lib/bugfix-loop-commit.mjs` (Task 8, full read)
- `lib/worktree.mjs` (branch naming `adev/<slug>`)
- `lib/tracker-provider-bridge/outbound-writeback.mjs` (degrade-on-external-failure pattern)
- Spec BEH-4, BEH-5, BEH-7, Error Cases `COMMIT_PR_SKIPPED`; constitution commit-trailer policy
- `docs/test-strategies.md:92,392,414` and `docs/governance.md:110-116` (the repo's actual `ci_tag: integration` convention: tests named/tagged so `node --test --test-name-pattern "integration"` selects them, run via `npm run test:integration` once that script is defined — currently a documented no-op per governance.md, not yet wired for this repo)

- [ ] **Write failing test**

```javascript
test('commitAndOpenPr commits with Spec:/Issue: trailers, pushes adev/bugfix-<id>, opens a PR against the resolved base', () => {
  // mock execFileSync: assert every git/gh call uses argv arrays, never a shell string
});
test('commitAndOpenPr with worktree-per-bug active stacks the PR base on the previous bug branch (not always main)', () => { /* ... */ });
test('commitAndOpenPr degrades to a logged COMMIT_PR_SKIPPED when gh is missing/unauthenticated or push is rejected — never throws', () => { /* ... */ });
test('commitAndOpenPr falls back to a generic templated commit message when title/notes are refused by validateCommitContent', () => { /* ... */ });
```

```javascript
// tests/integration/bugfix-loop-commit-pr-live.test.mjs — named with "integration"
// so `node --test --test-name-pattern "integration"` selects it; excluded from the
// default `npm test` run (mirrors docs/test-strategies.md's documented pattern).
// Per feedback_falsify_guards / the project's no-silent-skip convention: when this
// suite IS invoked (test:integration / the name-pattern run) and its infra
// (authenticated `gh`, network, a real scratch repo) is unavailable, it MUST fail
// hard with a clear "infra unavailable" message — never silently skip.
test('integration: commitAndOpenPr happy path against a real scratch git repo and gh CLI opens an actual PR', async () => {
  // requires: authenticated `gh` (GH_TOKEN or `gh auth status`), network reachability,
  // and a disposable scratch repo (created/torn down by the test, never this repo).
  // If any precondition is missing, throw — do not skip.
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/bugfix-loop-commit.test.mjs`
Expected: FAIL — `commitAndOpenPr is not a function`

- [ ] **Implement**

```javascript
import { execFileSync } from 'node:child_process';

export function commitAndOpenPr({ cwd, issueId, title, notes, specPath, baseBranch, prBase }) {
  // git add -A / git commit -m <message-from-safeCommitMessage> (argv array, execFileSync)
  // git push -u origin <branch> — on failure, log COMMIT_PR_SKIPPED, return { skipped: true, reason }
  // gh pr create --base <prBase> --title <safe-title> --body <trailers> — same degrade
  // never invoke via a shell string; every git/gh call is execFileSync(cmd, argvArray)
}
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/bugfix-loop-commit.test.mjs`
Expected: PASS
Run (opt-in, requires real `gh`/network — never run in default `npm test`): `node --test --test-name-pattern "integration" tests/integration/bugfix-loop-commit-pr-live.test.mjs`
Expected: PASS when infra is present; a hard failure (not a skip) naming the missing precondition when it is not

- [ ] **Commit**

```bash
git add lib/bugfix-loop-commit.mjs tests/lib/bugfix-loop-commit.test.mjs tests/integration/bugfix-loop-commit-pr-live.test.mjs
git commit -m "feat(bugfix-loop): add commit/push/PR automation with stacked-base resolution

Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-execution-hardening.spec.md
Plan-task: 9"
```

---

## Task 10: `commit-pr` CLI Verb Wiring [specialist: none]

**Charter capability:** `/adev:bugfix-loop` Skill
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 9, Task 5
**Files:**
- Modify: `lib/cli/bugfix-loop.mjs` — add `commit-pr` subcommand
- Test: `tests/cli/bugfix-loop.test.mjs`

**Tests:** `tests/cli/bugfix-loop.test.mjs` — extend.

**Context to load:**
- `lib/cli/bugfix-loop.mjs` (full read)
- `lib/bugfix-loop-commit.mjs` (Task 9)
- `lib/bugfix-loop-run.mjs` `recordWorktreeBranch` (Task 4) — `commit-pr` must call this on success so the next bug's worktree stacks correctly

- [ ] **Write failing test**

```javascript
test('adev bugfix-loop commit-pr --run-id <id> --issue <id> commits, opens a PR, and updates run-state last_worktree_branch on success', () => { /* ... */ });
test('adev bugfix-loop commit-pr exits 0 with { skipped: true } on a degrade path, never non-zero', () => { /* ... */ });
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/bugfix-loop.test.mjs`
Expected: FAIL — `unknown subcommand: commit-pr`

- [ ] **Implement**

Add a `commit-pr` branch calling `commitAndOpenPr()` (Task 9), then on success calling `recordWorktreeBranch(projectRoot, runId, branch)` (Task 4) so the run-state reflects the new stacking base for the next bug.

- [ ] **Verify test passes**

Run: `node --test tests/cli/bugfix-loop.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/bugfix-loop.mjs tests/cli/bugfix-loop.test.mjs
git commit -m "feat(bugfix-loop): add commit-pr CLI verb

Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-execution-hardening.spec.md
Plan-task: 10"
```

---

## Task 11: Wire Step 4.5 into SKILL.md [specialist: none]

**Charter capability:** `/adev:bugfix-loop` Skill
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 10, Task 7
**Files:**
- Modify: `skills/bugfix-loop/SKILL.md` — new Step 4.5, renumber trailing steps' cross-references as needed
- Test: `tests/skills/bugfix-loop-skill.test.mjs`

**Tests:** `tests/skills/bugfix-loop-skill.test.mjs` — extend.

**Context to load:**
- `skills/bugfix-loop/SKILL.md` Step 4 (full read, insertion point)
- `lib/cli/bugfix-loop.mjs` `commit-pr` output shape (Task 10)
- Spec BEH-4, BEH-5, Migration Path Step 3

- [ ] **Write failing test**

```javascript
test('SKILL.md has a Step 4.5 that calls adev bugfix-loop commit-pr on a FIXED verdict when --worktree-per-bug or --auto-commit is set', () => { /* ... */ });
test('SKILL.md documents Step 4.5 is skipped entirely for PARKED/UNREPRODUCIBLE verdicts (BEH-5)', () => { /* ... */ });
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/bugfix-loop-skill.test.mjs`
Expected: FAIL — patterns not found

- [ ] **Implement**

Add Step 4.5 immediately after the existing Step 4 (`record-attempt`/`complete-turn`/outbound writeback), gated on (`FIXED` verdict) AND (`--worktree-per-bug` OR `--auto-commit`). Call `adev bugfix-loop commit-pr --run-id <run_id> --issue <id> --json`. `PARKED`/`UNREPRODUCIBLE` skip this step entirely — nothing committed or pushed.

- [ ] **Verify test passes**

Run: `node --test tests/skills/bugfix-loop-skill.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/bugfix-loop/SKILL.md tests/skills/bugfix-loop-skill.test.mjs
git commit -m "feat(bugfix-loop): add Step 4.5 commit/PR automation

Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-execution-hardening.spec.md
Plan-task: 11"
```

---

## Task 12: Run-State `summary_rows[]` (BEH-6) [specialist: none]

**Charter capability:** `/adev:bugfix-loop` Skill
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/bugfix-loop-run.mjs` — add `summary_rows: []` to `createRun`'s initial state; add `appendSummaryRow(projectRoot, runId, row)` and `formatSummaryTable(state)` exports
- Test: `tests/lib/bugfix-loop-run.test.mjs`

**Tests:** `tests/lib/bugfix-loop-run.test.mjs` — extend.

**Context to load:**
- `lib/bugfix-loop-run.mjs` (full read, Task 4's fields already present)
- Spec BEH-6 (row shape: issue id, verdict, files touched, tests added, priority bound, turn)

- [ ] **Write failing test**

```javascript
test('appendSummaryRow appends a row and formatSummaryTable renders it with the priority-bound column', () => {
  const state = createRun(projectRoot);
  appendSummaryRow(projectRoot, state.run_id, { issueId: 'issue-1', verdict: 'FIXED', filesTouched: 3, testsAdded: 1, priorityBound: 'P3', turn: 1 });
  const updated = readRunState(projectRoot, state.run_id);
  assert.equal(updated.summary_rows.length, 1);
  const table = formatSummaryTable(updated);
  assert.match(table, /issue-1/);
  assert.match(table, /P3/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/bugfix-loop-run.test.mjs`
Expected: FAIL — `appendSummaryRow`/`formatSummaryTable` not exported

- [ ] **Implement**

```javascript
export function appendSummaryRow(projectRoot, runId, row) {
  const state = readRunState(projectRoot, runId);
  state.summary_rows.push(row);
  return writeRunState(projectRoot, state);
}
export function formatSummaryTable(state) {
  // markdown table: | issue id | verdict | files touched | tests added | priority bound | turn |
}
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/bugfix-loop-run.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/bugfix-loop-run.mjs tests/lib/bugfix-loop-run.test.mjs
git commit -m "feat(bugfix-loop): add per-bug summary-row tracking (BEH-6)

Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-execution-hardening.spec.md
Plan-task: 12"
```

---

## Task 13: Extend `record-attempt` CLI + Wire Summary Table into Step 4/5 [specialist: none]

**Charter capability:** `/adev:bugfix-loop` Skill
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 12
**Files:**
- Modify: `lib/cli/bugfix-loop.mjs` — `record-attempt` gains `--files-touched`/`--tests-added`/`--priority-bound`; print the running table
- Modify: `skills/bugfix-loop/SKILL.md` — Step 4 (print table after `record-attempt`), Step 5 (reprint before the finish token), `git diff --stat`-based `--files-touched`/`--tests-added` computation
- Test: `tests/cli/bugfix-loop.test.mjs`, `tests/skills/bugfix-loop-skill.test.mjs`

**Tests:** `tests/cli/bugfix-loop.test.mjs` — extend (CLI-layer). `tests/skills/bugfix-loop-skill.test.mjs` — extend (skill-layer).

**Context to load:**
- `lib/cli/bugfix-loop.mjs` (full read)
- `lib/bugfix-loop-run.mjs` `appendSummaryRow`/`formatSummaryTable` (Task 12)
- `skills/bugfix-loop/SKILL.md` Step 4/5 (full read)
- Spec BEH-6, Migration Path Step 4

- [ ] **Write failing test**

```javascript
test('adev bugfix-loop record-attempt --files-touched 3 --tests-added 1 --priority-bound P3 appends a summary row and prints the running table', () => { /* ... */ });
```

```javascript
test('SKILL.md Step 4 computes --files-touched/--tests-added via git diff --stat immediately before record-attempt', () => { /* ... */ });
test('SKILL.md Step 5 reprints the full summary table before the ADEV-BUGFIXLOOP token', () => { /* ... */ });
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/bugfix-loop.test.mjs tests/skills/bugfix-loop-skill.test.mjs`
Expected: FAIL — new flags/patterns absent

- [ ] **Implement**

Extend `record-attempt`'s `parseArgs` options with `files-touched`/`tests-added`/`priority-bound` (all optional strings/numbers), call `appendSummaryRow` after `appendAttempt`, and print `formatSummaryTable(state)` to stdout. In SKILL.md Step 4, compute `--files-touched`/`--tests-added` via `git diff --stat` against the attempt's tree (the per-bug worktree when active, else the shared tree) immediately before calling `record-attempt`, and print the table. In Step 5, reprint the full table (read via the `finish` result or a fresh `guard --json` read) before the terminal token.

- [ ] **Verify test passes**

Run: `node --test tests/cli/bugfix-loop.test.mjs tests/skills/bugfix-loop-skill.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/bugfix-loop.mjs skills/bugfix-loop/SKILL.md tests/cli/bugfix-loop.test.mjs tests/skills/bugfix-loop-skill.test.mjs
git commit -m "feat(bugfix-loop): wire running summary table into Step 4/5 (BEH-6)

Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-execution-hardening.spec.md
Plan-task: 13"
```

---

## Task 14: Wire `--max-priority` Fail-Fast Validation + Threading [specialist: none]

**Charter capability:** Eligibility Filter (operator-configurable priority band)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 13
**Files:**
- Modify: `skills/bugfix-loop/SKILL.md` — Arguments (`--max-priority <P0-P4>`), Step 0 (fail-fast validation), Step 2 (`adev issues next --max-priority <resolved>` instead of the hardcoded `P3`), Step 4 (`record-attempt --priority-bound <resolved>`)
- Test: `tests/skills/bugfix-loop-skill.test.mjs`

**Tests:** `tests/skills/bugfix-loop-skill.test.mjs` — extend.

**Context to load:**
- `lib/issues/eligibility.mjs:26-51` (`PRIORITY_LABEL_TO_NUMBER`, `resolvePriorityBound` — already accepts full P0-P4 range)
- `lib/cli/issues-next.mjs` (full read — already prints BEH-12 stderr for P0/P1, unchanged by this task)
- `skills/bugfix-loop/SKILL.md` Step 0/1/2/4 (full read)
- Spec BEH-9, BEH-10, BEH-12, Error Cases `INVALID_PRIORITY_BOUND` (both rows)

- [ ] **Write failing test**

```javascript
test('SKILL.md documents --max-priority <P0-P4>, default P3, and rejects malformed values at Step 0 before bug selection', () => { /* ... */ });
test('Step 2 uses the resolved --max-priority value instead of the literal P3', () => { /* ... */ });
test('Step 4 passes --priority-bound <resolved> to record-attempt', () => { /* ... */ });
test('SKILL.md documents Step 2 must not redirect/suppress stderr so BEH-12 excluded-module output reaches the transcript', () => { /* ... */ });
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/bugfix-loop-skill.test.mjs`
Expected: FAIL — `adev issues next --type bug --max-priority P3` still hardcoded; `--priority-bound` absent

- [ ] **Implement**

Add `--max-priority <P0-P4>` to the Arguments section (default `P3`). At Step 0, before bug selection, validate the value is one of `P0`-`P4` (reject malformed values only — `P0`/`P1` are legal per the already-shipped amendment); on rejection, halt with `--status blocked` and the `BLOCKED` token, naming the rejected value (`INVALID_PRIORITY_BOUND`). Replace Step 2's literal `adev issues next --type bug --max-priority P3 --json` with the resolved value, and note explicitly that stderr must not be redirected or suppressed (BEH-12 passthrough). In Step 4, add `--priority-bound <resolved>` to the `record-attempt` call.

- [ ] **Verify test passes**

Run: `node --test tests/skills/bugfix-loop-skill.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/bugfix-loop/SKILL.md tests/skills/bugfix-loop-skill.test.mjs
git commit -m "feat(bugfix-loop): thread configurable --max-priority through Step 0/2/4

Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-execution-hardening.spec.md
Plan-task: 14"
```

---

## Task 15: Update Docs [specialist: none]

**Charter capability:** `/adev:bugfix-loop` Skill
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Tasks 2, 3, 6, 7, 10, 11, 13, 14
**Files:**
- Modify: `docs/cli-reference.md:665-679` — `bugfix-loop` verb section: add `check-freshness`, `commit-pr`; update `create`/`guard`/`record-attempt` signatures
- Modify: `docs/skill-reference.md:464-488` — `/adev:bugfix-loop` entry: add `--worktree-per-bug`, `--auto-commit`, `--max-priority` arguments and their default-OFF/default-P3 behavior

**Tests:** `tests/skills/bugfix-loop-skill.test.mjs` — extend (a doc-drift check: every new subverb/arg named in SKILL.md also appears in `docs/cli-reference.md`/`docs/skill-reference.md`).

**Context to load:**
- `docs/cli-reference.md:659-692` (existing `next`/`bugfix-loop`/`tracker-sync` sections — follow the same format)
- `docs/skill-reference.md:464-488` (existing `/adev:bugfix-loop` entry)
- `skills/bugfix-loop/SKILL.md` (final state, all prior tasks)

- [ ] **Write failing test**

```javascript
test('every new bugfix-loop subverb (check-freshness, commit-pr) and skill arg (--worktree-per-bug, --auto-commit, --max-priority) appears in docs/cli-reference.md and/or docs/skill-reference.md', () => { /* ... */ });
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/bugfix-loop-skill.test.mjs`
Expected: FAIL — new terms absent from docs

- [ ] **Implement**

Update `docs/cli-reference.md`'s `bugfix-loop` section signature line and add prose for `check-freshness`/`commit-pr`. Update `docs/skill-reference.md`'s `/adev:bugfix-loop` Arguments list with the three new flags and their defaults.

- [ ] **Verify test passes**

Run: `node --test tests/skills/bugfix-loop-skill.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add docs/cli-reference.md docs/skill-reference.md tests/skills/bugfix-loop-skill.test.mjs
git commit -m "docs(bugfix-loop): document freshness/worktree/commit-pr/max-priority additions

Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-execution-hardening.spec.md
Plan-task: 15"
```

---

## Task 16: Integration Verification — Isolation, Stacking, Table, Priority Band [specialist: none]

**Charter capability:** `/adev:bugfix-loop` Skill
**Strategy:** unit (source: fallback, confidence: high) — mechanism-level, runs against a real fixture git repo (no external network/`gh`)
**Depends on:** Tasks 7, 11, 13, 14
**Files:**
- Modify: `tests/integration/bugfix-loop-loop.test.mjs`

**Tests:** `tests/integration/bugfix-loop-loop.test.mjs` — extend.

**Context to load:**
- `tests/integration/bugfix-loop-loop.test.mjs` (full read — existing fixture/harness pattern)
- Spec Migration Path Step 2 Verification (two-bug isolation + stacking), BEH-3, BEH-6, BEH-9

- [ ] **Write failing test**

```javascript
test('two bugs whose fixes touch overlapping files never cross-contaminate when --worktree-per-bug is active', () => {
  // simulate two sequential attempts, assert each worktree's diff contains only its own bug's change
});
test('the second bug worktree branches from the first bug completed branch, not the loop starting branch, when stacking is active', () => { /* ... */ });
test('existing loop tests still pass with --worktree-per-bug unset (default off, no behavior change)', () => { /* ... */ });
test('the running summary table accumulates one row per attempt with the correct priority-bound column', () => { /* ... */ });
```

- [ ] **Verify test fails**

Run: `node --test tests/integration/bugfix-loop-loop.test.mjs`
Expected: FAIL — new assertions fail against pre-Task-16 skill/lib behavior

- [ ] **Verify implementation is complete**

This task is verification-only — all underlying behavior was implemented in Tasks 1-14. If any assertion fails, the gap is in an earlier task, not here; fix the earlier task's implementation rather than adding new production code in this task.

- [ ] **Verify test passes**

Run: `node --test tests/integration/bugfix-loop-loop.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add tests/integration/bugfix-loop-loop.test.mjs
git commit -m "test(bugfix-loop): verify worktree isolation, PR stacking, and summary table end-to-end

Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-execution-hardening.spec.md
Plan-task: 16"
```

---

## Test Infrastructure Requirements

> These requirements must be satisfied before `tests/integration/bugfix-loop-commit-pr-live.test.mjs`
> (Task 9) can run. Every other task in this plan resolves to `unit` with no external
> infrastructure. This section exists solely because the spec's Migration Path Step 3
> Verification explicitly requires one real, non-mocked happy-path test for `gh pr create` —
> **never record actual credential values in plan output or spec files — env var names only.**

### External Systems

| System | Required By | Strategy |
|--------|-------------|----------|
| GitHub (`gh` CLI, authenticated) | Task 9 (`tests/integration/bugfix-loop-commit-pr-live.test.mjs`) | integration |
| Network access (git push / GitHub API) | Task 9 (same test) | integration |

### Credentials / Environment Variables

| Variable | Required For | Where to Get It |
|----------|-------------|-----------------|
| `GH_TOKEN` (or a pre-authenticated `gh auth login` session) | `gh pr create` against a disposable scratch repo | A dedicated test GitHub account/token, scoped to `repo`; inject as a CI secret, never hardcode |

### Pre-Provisioned State

- [ ] A disposable scratch GitHub repository the test can push branches to and open/close PRs against (created and torn down by the test itself, never this repo)
- [ ] `gh` CLI installed and authenticated in the environment running this suite

### CI Configuration

This test is excluded from the default `npm test` run. To execute:
```bash
node --test --test-name-pattern "integration" tests/integration/bugfix-loop-commit-pr-live.test.mjs
```

> Per this project's no-silent-skip convention: when this suite IS invoked and its
> infrastructure is unavailable, it fails hard (throws, naming the missing precondition)
> rather than skipping. It is the *invocation* that is opt-in (excluded from default
> `npm test`), not the pass/fail behavior once invoked.

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied:
  - Freshness ahead/behind computation (BEH-1, BEH-2) — Tasks 1-3
  - Worktree isolation via the reused `lib/worktree.mjs` primitive; no cross-fix contamination; base-ref stacking (BEH-3) — Tasks 4-7, 16
  - Commit-pr happy path + degrade paths (BEH-4, BEH-5, BEH-7) — Tasks 8-11
  - Argv-array subprocess invocation + refuse-not-sanitize handling of unsafe WorkItem content (BEH-11) — Task 8, 9
  - Excluded-module stderr passthrough (BEH-12) — Task 14 (verb layer already shipped)
  - Crash-recovery orphan sweep (BEH-13) — Task 7
  - Summary-table formatting including the `--priority-bound` column (BEH-6) — Tasks 12, 13, 16
  - `--max-priority` fail-fast rejection of malformed values only; pass-through of the full P0-P4 range (BEH-9, BEH-10) — Task 14
- No constitutional violations introduced (Node built-ins only; no CommonJS; no inline Node in `skills/bugfix-loop/SKILL.md`; commit trailers on every `Spec:`-tracked commit)
- `--worktree-per-bug` and `--auto-commit` default OFF; existing invocations without these flags behave identically to pre-refactor behavior
- No new worktree library or CLI verb introduced; `--worktree-per-bug` uses only `lib/worktree.mjs`/`adev worktree add|remove`
- `docs/cli-reference.md` and `docs/skill-reference.md` updated for every new subverb/argument (Task 15)
