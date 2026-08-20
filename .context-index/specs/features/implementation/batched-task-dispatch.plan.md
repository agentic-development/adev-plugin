<!-- partial_schema: plan@1 -->

# Implementation Plan: Batched Task Dispatch

> **Methodology:** adev
> **Charter:** .context-index/specs/features/implementation/charter.md
> **Spec:** .context-index/specs/features/implementation/batched-task-dispatch.spec.md (revision 1)
> **Review:** PASS_WITH_NOTES (2026-08-18) — quick tier, 0 blockers, 2 warnings, 2 suggestions
> **Platform:** Node.js (ESM, `.mjs`), zero external dependencies, `node:test`

**Goal:** Let `/adev:implement` dispatch a `(sequential)` group of 2–4 eligible plan tasks to a single subagent that works them one at a time with full TDD, both review stages, and one commit per task — on by default, decoupled from `--parallel` and its worktree machinery, with `--no-batch` as the escape hatch.

**Architecture:** Batching is consumed, not computed: a new `lib/implement/batching.mjs::resolveBatches()` reuses the existing `parseParallelizationSection()` (`lib/parallel/groups.mjs`) to read the plan's `## Parallelization` section, then applies a fail-closed eligibility gate (group kind, size cap, routing sidecar checks via `lib/plan-routing-sidecar.mjs`, governance boundaries via `lib/governance/boundaries.mjs`, and prior-run abort carry-forward via `lib/lifecycle-state.mjs::currentState()`). A sibling `lib/implement/batch-verify.mjs` gives Contract C/D's two most agent-behavior-dependent invariants (one Handoff Block per task; no context packet read ahead of the preceding task's commit) a mechanical, disk-checkable postcondition instead of relying solely on prose the subagent is instructed to follow — mirroring `lib/parallel/verify.mjs`'s `COMMITS_NOT_VERIFIED` stance ("check the artifact, don't trust the report"). A new CLI verb `adev implement batches` (added to the existing `lib/cli/implement.mjs`) exposes the resolver, wired the same way `adev parallel groups` wraps `parseParallelizationSection` in `lib/cli/parallel.mjs` — same shape, new axis. Two new manifest knobs (`implement.batch_mode`, `implement.max_batch_size`) get throw-not-default validators in `lib/manifest.mjs`, structurally copying `validateMaxReviewRetries()`. The orchestration narrative — one subagent per batch, sequential per-task TDD with both review stages at unchanged depth, read-ahead prohibition, abort semantics — lands in a new conditionally-loaded companion `skills/implement/batched-mode.md`, following the precedent `parallel-mode.md` set when `SKILL.md` first crossed the Copilot byte cap. The release-blocking equivalence eval reuses `lib/parallel/eval/divergence.mjs` (`judge`) and `lib/parallel/eval/report.mjs` (`renderReport`, `scoreRubric`) — both already provider-agnostic behavioral comparators — under a new 2-arm harness at `tests/evals/batched-task-dispatch/`, mirroring `tests/evals/worktree-parallelization/run-ab-eval.mjs`.

**Review notes carried forward (acknowledged, not fixed by this plan):**
- The `--max-batch`'s error path (non-integer / non-finite / `< 1`) is specified in the Arguments table as `INVALID_MAX_BATCH_SIZE` from `loadManifest()`, but a *per-run* `--max-batch <n>` override bypasses `loadManifest()` entirely — it is a CLI flag, not a manifest read. Task 3 below specifies that the CLI verb validates `--max-batch` with the exact same predicate `validateMaxBatchSize()` uses (integer, finite, `>= 1`), throwing the same `INVALID_MAX_BATCH_SIZE` code, so the error path is identical regardless of source. This closes the gap the review flagged without inventing a second error code.
- The review flagged an imprecise citation to `incremental-artifact-writes.spec.md`'s "Integration Point 2" — that Integration Point is actually about `/adev:implement`'s TDD commits being "already incremental" and does not itself state the one-commit-per-task rule. The one-commit-per-task rule this spec (Contract C.2) actually rests on is `skills/implement/SKILL.md` step 2h item 3 ("Commit-per-task is MANDATORY... Multi-task implementations with a single combined commit are forbidden"), which itself cites the same spec's Integration Point 2 loosely. This plan does not touch the citation — it is prose already on disk in the spec, not a code contract, and the note says explicitly no spec revision is needed. Tasks below cite step 2h item 3 directly rather than propagating the loose citation.

**Charter note:** `.context-index/specs/features/implementation/charter.md` is an `/adev:init`-generated draft with no Capability Map table. Tasks trace to the charter's **Key Behaviors** ("TDD is enforced: RED → GREEN → REFACTOR"; "Specialist routing matches tasks to domain experts") and **Key Files** (`skills/implement/SKILL.md`) instead; there is no `Status` column to flip at Step 7.

---

## File Structure

**Create:**
- `lib/implement/batching.mjs` — `resolveBatches()`: reads `## Parallelization`, applies the eligibility gate, folds in prior-run abort state, returns `{ batches, solo, advisories }`
- `lib/implement/batch-verify.mjs` — `verifyHandoffBlocks()` / `verifyNoReadAhead()` / `verifyPerTaskReviewRounds()`: artifact-level postconditions for AC4 (N handoff blocks), AC6 (no read-ahead), and AC5 (both review stages per task), mirroring `lib/parallel/verify.mjs`'s "check the artifact, don't trust the report" stance
- `tests/lib/implement/batching.test.mjs` — one test per eligibility row plus abort-carry-forward and `--no-batch` cases
- `tests/lib/implement/batch-verify.test.mjs` — handoff-block count and read-ahead-violation cases
- `tests/cli/implement-batches.test.mjs` — CLI surface: happy path, `CONFLICTING_BATCH_FLAGS`, `--max-batch` validation, missing routing sidecar
- `skills/implement/batched-mode.md` — batched dispatch orchestration prose (companion to `SKILL.md`, loaded conditionally)
- `tests/skills/implement-batched-mode.test.mjs` — doc-contract test, mirroring `tests/skills/implement-parallel.test.mjs`
- `tests/evals/batched-task-dispatch/fixture/example.plan.md` — fixture plan with one eligible `(sequential)` group of 2 tasks and one ineligible task
- `tests/evals/batched-task-dispatch/fixture/example.routing.json` — matching routing sidecar (all tasks `auto-agent`, usable scores)
- `tests/evals/batched-task-dispatch/run-ab-eval.mjs` — 2-arm `[live]` equivalence harness (`no-batch` baseline vs `batched` variant)
- `tests/evals/batched-task-dispatch/run-ab-eval.smoke.test.mjs` — `--dry-run` smoke test

**Modify:**
- `lib/manifest.mjs:56-68` (`loadManifest`, to materialize the new `implement` section) and after `validateMaxReviewRetries` (~line 158) to add `validateBatchMode()` / `validateMaxBatchSize()`
- `tests/lib/manifest.test.mjs` — extend with `implement.batch_mode` / `implement.max_batch_size` default + validation cases, mirroring the existing `max_review_retries` block (lines 109-206)
- `.context-index/manifest.yaml` — add a commented `implement:` documentation block (pattern: the existing commented `heuristics:` / `lifecycle:` blocks)
- `lib/cli/implement.mjs:45-51` (subverb switch) and `:125-139` (`help()`) — add the `batches` subverb
- `skills/implement/SKILL.md:10-18` (Arguments), `:288-292` (Step 2 entry, before 2.pre), `:655-658` (pointer table, new row), Failure Modes-equivalent prose (this skill has no single Failure Modes table today — advisories are inline; add `BATCH_DISPATCHED` / `BATCH_SOLO_FORCED` / `BATCH_ABORTED` where 2.5's fallback prose lives)
- `docs/cli-reference.md:477` (near `adev implement read-routing`) — document `adev implement batches`
- `docs/skill-reference.md:322-323` (near the `--parallel` / `--fresh` flag docs) — document `--no-batch` / `--max-batch`

**Reference (read, do not modify):**
- `lib/parallel/groups.mjs` — `parseParallelizationSection()`, reused verbatim (no new grouping axis)
- `lib/plan-routing-sidecar.mjs` — `readRoutingSidecar()` / `lookupRoutingEntry()`, reused for the eligibility gate's routing rows
- `lib/governance/boundaries.mjs` — `checkBoundaries(projectRoot, { changed })`, reused for the "no task crosses a governance boundary" row
- `lib/lifecycle-state.mjs:1962` (`currentState`) and its `planTasks` projection — reused for abort carry-forward (Behavior E); its `reviewRounds` projection (`:2123`, keyed `${plan}::${task_id}::${stage}`, shipped by `review-provenance.spec.md` which lists this spec under its own `enables:`) — reused for AC5's mechanical check
- `lib/parallel/verify.mjs` — `verifyGroupComplete()`'s "check the artifact, don't trust the report" pattern, mirrored by `lib/implement/batch-verify.mjs` (Task 2) for Handoff Block count (AC4) and read-ahead order (AC6)
- `skills/write-test/write-handoff.sh:62` — the `<packets_dir>/<slug>-tests.md` Handoff Block naming convention `verifyHandoffBlocks()` checks against
- `skills/implement/parallel-mode.md` — the structural precedent this plan's `batched-mode.md` follows (conditional-loading companion, extracted for the same byte-cap reason)
- `lib/cli/parallel.mjs` — the CLI-verb-wrapping-a-pure-parser precedent `adev implement batches` follows
- `lib/parallel/eval/divergence.mjs` (`judge`, `testSetDivergence`, `surfaceDivergence`) and `lib/parallel/eval/report.mjs` (`renderReport`, `scoreRubric`) — reused, not reimplemented, in the equivalence eval
- `tests/evals/worktree-parallelization/run-ab-eval.mjs` and its `.smoke.test.mjs` — the 3-arm harness shape this plan's 2-arm harness mirrors
- `.context-index/governance/gates.yaml` — the `test` gate (severity: error, `npm test`, triggers `post-task`/`post-implement`) that Quality Gates below names
- `.context-index/governance/boundaries.yaml` — all active rules are `severity: warning` in this repo today; the eligibility gate's boundary row will not currently force any task solo here, but must still be evaluated per the spec's fail-closed contract

---

## Context Packets

### Task 1 Context
- Spec: `batched-task-dispatch.spec.md` (Arguments table — the `implement.batch_mode` / `implement.max_batch_size` surface row)
- Charter: `implementation/charter.md` (Key Behaviors — none directly; this task is pure config plumbing feeding Task 2)
- Source files, full read: `lib/manifest.mjs` (all of it — small file)
- Source files, signatures only: `tests/lib/manifest.test.mjs` (`grep "^test("` — existing `max_review_retries` block is the pattern to mirror)
- Reference: `lib/errors.mjs` (`codedError`) — the shared coded-error constructor both new validators use

### Task 2 Context
- Spec: `batched-task-dispatch.spec.md` (Output Contract A, B, C, D, E, F in full, plus Acceptance Criteria 4, 5, and 6 specifically — this task is the core of the spec and the only one with mechanical, non-doc-contract proof of Contract C/D)
- Charter: `implementation/charter.md` (Key Behaviors — "TDD is enforced"; batching must not weaken this)
- Source files, full read: `lib/parallel/groups.mjs`, `lib/plan-routing-sidecar.mjs`, `lib/manifest.mjs` (post-Task-1), `lib/parallel/verify.mjs` (the `COMMITS_NOT_VERIFIED` precedent `batch-verify.mjs` mirrors), `skills/write-test/write-handoff.sh` (Handoff Block file naming, line 62)
- Source files, signatures only: `lib/governance/boundaries.mjs` (`grep "^export"` — only `checkBoundaries` needed), `lib/lifecycle-state.mjs` (`grep "^export function currentState"` plus the `planTasks` projection typedef around line 1777)
- Reference: `lib/cli/parallel.mjs` (how an existing verb composes these same primitives), `skills/implement/parallel-mode.md` (Behavior E's abort semantics mirror the parallel `COMMITS_NOT_VERIFIED` / retained-worktree handling, minus worktrees)

### Task 3 Context
- Spec: `batched-task-dispatch.spec.md` (Arguments table, Output Contract A "A new verb resolves the batch plan")
- Source files, full read: `lib/cli/implement.mjs` (small; add a case), `lib/implement/batching.mjs` (from Task 2)
- Reference: `lib/cli/parallel.mjs` (subcommand-switch shape, `emit()`/`argErr()` helpers, exit-code table in its own header comment), `lib/cli/implement.mjs`'s own `read-routing` subverb (exit-code convention: 1 argument error, 2+ for domain errors)

### Task 4 Context
- Spec: `batched-task-dispatch.spec.md` (Output Contract A, C, D, E, F — this doc is the operator-facing narrative for all of them)
- Source files, full read: `skills/implement/parallel-mode.md` (the structural template), `skills/implement/tdd-mandate.md` (cited by reference, not duplicated)
- Reference: `skills/implement/SKILL.md:466-653` (2d dispatch discipline, 2f/2g review loops, 2h completion — batched-mode.md must say "unchanged, per task" without re-deriving the loop bodies)

### Task 5 Context
- Spec: `batched-task-dispatch.spec.md` (Arguments, Relationship to `--parallel` table, Failure Modes table in full)
- Source files, full read: `skills/implement/SKILL.md` lines 1-54 (Arguments/Prerequisites) and 288-310 (Step 2 entry) and 655-664 (pointer table)
- Reference: `skills/implement/batched-mode.md` (from Task 4 — the pointer target), `tests/skills/implement-parallel.test.mjs` (the doc-contract pattern Task 5's own assertions in `implement-batched-mode.test.mjs` follow)

### Task 6 Context
- Spec: `batched-task-dispatch.spec.md` (Arguments table, Output Contract A verb signature)
- Source files, full read: `docs/cli-reference.md` (section around `adev implement read-routing`, line 477), `docs/skill-reference.md` (section around lines 315-335, the `/adev:implement` flag list)
- Reference: `docs/build-phase.md` (has a "Parallel Execution" section; optional — add a short "Batched Dispatch" pointer only if it doesn't bloat scope)

### Task 7 Context
- Spec: `batched-task-dispatch.spec.md` (Output Contract G — the equivalence eval acceptance criterion, which is release-blocking)
- Source files, full read: `tests/evals/worktree-parallelization/run-ab-eval.mjs`, `tests/evals/worktree-parallelization/run-ab-eval.smoke.test.mjs`, `tests/evals/worktree-parallelization/fixture/example.plan.md`
- Source files, signatures only: `lib/parallel/eval/divergence.mjs` (`grep "^export function"`), `lib/parallel/eval/report.mjs` (`grep "^export function"`)
- Reference: `lib/implement/batching.mjs` (Task 2 — the fixture's expected `resolveBatches()` output), `lib/plan-routing-sidecar.mjs` (routing sidecar fixture schema)

---

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: Cache reads are 71% of session cost — minimize context accumulation (confidence: medium)
- **Pattern:** When optimizing token cost, focus on reducing what accumulates in conversation context (output echoes, artifact dumps, verbose subagent returns). Every output token persists as a cache read on all subsequent turns, creating multiplicative amplification.
- **Anti-pattern:** Focus on reducing input token counts (SKILL.md sizes, context packets). Input is <1% of cost; cache reads at 0.1x pricing dominate due to volume (98% of all tokens processed).
- **Relevance to Task 4:** A batch subagent holds context across N tasks — its own report volume for tasks 1..N-1 is exactly the "accumulates in conversation context" case this heuristic warns about. `batched-mode.md` should instruct the batch agent to keep each task's own report terse (same discipline 2c item 1b already imposes solo), not to compound N reports into one long narration.

### Heuristic: Summarized skill output produces equivalent artifact quality (confidence: medium)
- **Pattern:** When a skill writes an artifact to disk (plan, review, validation report), instruct it to return only a structured summary to the conversation. The artifact on disk will be equally complete — the summarization instruction affects echo volume, not reasoning.
- **Relevance to Task 4:** Each task's Handoff Block (Contract D) is the on-disk artifact; the batch agent's per-task chat report can stay terse without weakening per-task rigor.

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4 → Task 5 (shared files: `lib/manifest.mjs` feeds `lib/implement/batching.mjs` feeds `lib/cli/implement.mjs` feeds `batched-mode.md` feeds `SKILL.md`'s pointer to it)
- Group B (independent): Task 6 (docs only; depends on Task 3 and Task 5's shipped surface for accuracy, but touches no file Group A touches)
- Group C (independent): Task 7 (new eval directory only; imports Task 2's `batch-verify.mjs` directly and depends on Task 3 and Task 5's shipped behavior for the fixture to mean anything, but touches no file Group A or B touches)

Groups B and C can run in parallel with each other once Group A finishes; neither can start meaningfully before Task 3 and Task 5 land, since both describe or exercise a surface that does not exist before then. (This plan does not claim B/C are eligible for *this spec's own* batching mechanism — that mechanism doesn't exist until Group A ships it.)

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Manifest validation for `implement.batch_mode` / `implement.max_batch_size` | small | unit | — | 0 create, 3 modify |
| 2 | Batch resolution engine + artifact verification | large | unit | Task 1 | 4 create, 0 modify |
| 3 | `adev implement batches` CLI verb | medium | unit | Task 2 | 1 create, 1 modify |
| 4 | `skills/implement/batched-mode.md` companion | medium | unit | Task 3 | 2 create, 0 modify |
| 5 | `SKILL.md` batched-dispatch wiring | medium | unit | Task 4 | 0 create, 1 modify |
| 6 | Documentation updates | small | unit | Task 3, Task 5 | 0 create, 2 modify |
| 7 | Equivalence eval harness | large | unit | Task 2, Task 3, Task 5 | 4 create, 0 modify |

---

## Task Structure

### Task 1: Manifest validation for `implement.batch_mode` / `implement.max_batch_size` [specialist: none]

**Charter capability:** Key Behaviors — "Specialist routing matches tasks to domain experts declared in manifest" (this task extends the manifest's own validated-config discipline that specialist routing already relies on).
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/manifest.mjs:56-68` (`loadManifest`, materialize `implement` section), after line 158 (`validateMaxReviewRetries`, add the two new validators)
- Modify: `tests/lib/manifest.test.mjs` (extend)
- Modify: `.context-index/manifest.yaml` (add commented `implement:` doc block)

**Tests:** `tests/lib/manifest.test.mjs` — extend with cases mirroring the existing `max_review_retries` block (lines 109-206).

**Context to load:**
- `batched-task-dispatch.spec.md` — Arguments table, the `implement.batch_mode` / `implement.max_batch_size` row
- `lib/errors.mjs` — `codedError(code, message)`

- [ ] **Write failing test**

```javascript
test("loadManifest: defaults implement.batch_mode to 'on' and max_batch_size to 4 when omitted", () => {
  const dir = createTempDir();
  try {
    writeFixture(dir, ".context-index/manifest.yaml", "project:\n  name: t\n");
    const m = loadManifest(dir);
    assert.equal(m.implement.batch_mode, "on");
    assert.equal(m.implement.max_batch_size, 4);
  } finally { cleanupTempDir(dir); }
});

test("loadManifest: rejects implement.batch_mode outside on|off — INVALID_BATCH_MODE", () => {
  const dir = createTempDir();
  try {
    writeFixture(dir, ".context-index/manifest.yaml",
      "project:\n  name: t\nimplement:\n  batch_mode: sometimes\n");
    assert.throws(() => loadManifest(dir), (err) => err.code === "INVALID_BATCH_MODE");
  } finally { cleanupTempDir(dir); }
});

test("loadManifest: rejects implement.max_batch_size < 1 — INVALID_MAX_BATCH_SIZE", () => {
  const dir = createTempDir();
  try {
    writeFixture(dir, ".context-index/manifest.yaml",
      "project:\n  name: t\nimplement:\n  max_batch_size: 0\n");
    assert.throws(() => loadManifest(dir), (err) => err.code === "INVALID_MAX_BATCH_SIZE");
  } finally { cleanupTempDir(dir); }
});
```

Also add non-integer / non-finite / fractional cases for `max_batch_size`, mirroring the three `max_review_retries` rejection tests exactly (lines 159-206 of the existing file), and an explicit-value round-trip test (`max_batch_size: 2` → `m.implement.max_batch_size === 2`).

- [ ] **Verify test fails**

Run: `node --test tests/lib/manifest.test.mjs`
Expected: FAIL — `m.implement` is `undefined` (no `batch_mode`/`max_batch_size` key yet); `INVALID_BATCH_MODE` / `INVALID_MAX_BATCH_SIZE` never thrown.

- [ ] **Implement**

In `lib/manifest.mjs`, add two validators structurally identical to `validateMaxReviewRetries` (lines 132-158), and call both from `loadManifest` right after the existing `validateMaxReviewRetries(parsed.build)` call:

```javascript
const VALID_BATCH_MODES = new Set(["on", "off"]);

function validateBatchMode(implement) {
  const raw = implement.batch_mode;
  if (raw === undefined || raw === null) {
    implement.batch_mode = "on"; // default per spec Arguments table
    return;
  }
  if (!VALID_BATCH_MODES.has(raw)) {
    throw mkErr(
      "INVALID_BATCH_MODE",
      `implement.batch_mode must be 'on' or 'off'; got ${JSON.stringify(raw)}`,
    );
  }
  implement.batch_mode = raw;
}

function validateMaxBatchSize(implement) {
  const raw = implement.max_batch_size;
  if (raw === undefined || raw === null) {
    implement.max_batch_size = 4; // default per spec Arguments table
    return;
  }
  if (typeof raw !== "number" || !Number.isFinite(raw) || !Number.isInteger(raw) || raw < 1) {
    throw mkErr(
      "INVALID_MAX_BATCH_SIZE",
      `implement.max_batch_size must be an integer >= 1; got ${JSON.stringify(raw)}`,
    );
  }
  implement.max_batch_size = raw;
}
```

In `loadManifest`, right after the `build` materialization block:

```javascript
if (!parsed.implement || typeof parsed.implement !== "object") {
  parsed.implement = {};
}
validateBatchMode(parsed.implement);
validateMaxBatchSize(parsed.implement);
```

Export both validators (named exports) so Task 3's CLI verb can reuse `validateMaxBatchSize` verbatim for the `--max-batch <n>` flag's own error path (per the review note above — same predicate, same error code, regardless of source).

Add the commented doc block to `.context-index/manifest.yaml`, matching the style of the existing commented `heuristics:` block:

```yaml
# implement:
#   batch_mode: on          # on | off — default on (Requires Human Approval; see
#                            # batched-task-dispatch.spec.md System Constitution Reference)
#   max_batch_size: 4       # integer >= 1 — cap on tasks per batch
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/manifest.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch (if not already created): `feat/implementation/batched-task-dispatch`

```bash
git add lib/manifest.mjs tests/lib/manifest.test.mjs .context-index/manifest.yaml
git commit -m "feat(implementation): validate implement.batch_mode and max_batch_size

Spec: .context-index/specs/features/implementation/batched-task-dispatch.spec.md
Plan-task: 1"
```

### Task 2: Batch resolution engine + artifact verification [specialist: none]

**Charter capability:** Key Behaviors — "TDD is enforced: RED → GREEN → REFACTOR" (this task's eligibility gate is what keeps that guarantee intact when N tasks share an agent).
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Create: `lib/implement/batching.mjs`
- Create: `lib/implement/batch-verify.mjs`
- Create: `tests/lib/implement/batching.test.mjs`
- Create: `tests/lib/implement/batch-verify.test.mjs`

**Tests:** `tests/lib/implement/batching.test.mjs` and `tests/lib/implement/batch-verify.test.mjs` (both create — no existing suite covers either behavior)

**Context to load:**
- `batched-task-dispatch.spec.md` — Output Contract A, B (all six eligibility rows), C (Handoff Block count — AC4), D (context hygiene, read-ahead prohibition — AC6), E (abort semantics), F (advisories)
- `lib/parallel/groups.mjs` (full) — `parseParallelizationSection()`
- `lib/plan-routing-sidecar.mjs` (full) — `readRoutingSidecar()`
- `lib/governance/boundaries.mjs` (signatures) — `checkBoundaries(projectRoot, { changed })`
- `lib/lifecycle-state.mjs` (signature + `planTasks` typedef around line 1777) — `currentState(projectRoot, specPath)`
- `lib/parallel/verify.mjs` (full) — `verifyGroupComplete()`, the direct precedent for treating "did the artifact actually land" as a checkable postcondition (`COMMITS_NOT_VERIFIED`) rather than trusting the agent's report; `batch-verify.mjs` is the same idea applied to Handoff Blocks and read-order instead of commits
- `skills/write-test/write-handoff.sh:62` — the Handoff Block file naming convention (`<packets_dir>/<slug>-tests.md`), needed to write `verifyHandoffBlocks()` against the real on-disk shape

This is the largest task in the plan; it carries Output Contract B's whole eligibility gate (six rows), Behavior E's abort carry-forward, and three artifact-level postcondition checks that give Acceptance Criteria 4, 5, and 6 something mechanical to assert against instead of doc-contract prose alone (`resolveBatches()` in `batching.mjs`; `verifyHandoffBlocks()`, `verifyNoReadAhead()`, and `verifyPerTaskReviewRounds()` in `batch-verify.mjs`, split out the way `lib/parallel/groups.mjs` and `lib/parallel/verify.mjs` are two files for two concerns, not one function per file). Both files are pure-function logic over already-loaded/passed-in data (no I/O side effects beyond what the caller in Task 3 supplies).

- [ ] **Write failing test**

```javascript
// tests/lib/implement/batching.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { resolveBatches } from "../../../lib/implement/batching.mjs";

const PLAN = `## Parallelization

- Group A (sequential): Task 1 → Task 2 (shared files)
- Group B (independent): Task 3

## Task Summary
`;

function routingFor(entries) {
  // entries: [{task_id, selected_agent, scores}]
  return entries;
}

test("a 2-task sequential group within the cap batches together", () => {
  const result = resolveBatches({
    planContent: PLAN,
    manifest: { implement: { batch_mode: "on", max_batch_size: 4 } },
    routingEntries: routingFor([
      { task_id: "1", selected_agent: "auto-agent", scores: { spec_completeness: 0.9, pattern_coverage: 0.8, blast_radius: 0.2, novelty: 0.3 } },
      { task_id: "2", selected_agent: "auto-agent", scores: { spec_completeness: 0.9, pattern_coverage: 0.8, blast_radius: 0.2, novelty: 0.3 } },
      { task_id: "3", selected_agent: "auto-agent", scores: { spec_completeness: 0.9, pattern_coverage: 0.8, blast_radius: 0.2, novelty: 0.3 } },
    ]),
    boundaryVerdicts: { "1": "PASS", "2": "PASS", "3": "PASS" },
    priorPlanTasks: {},
  });
  assert.equal(result.batches.length, 1);
  assert.deepEqual(result.batches[0].taskIds, ["1", "2"]);
  assert.equal(result.solo.length, 1);
  assert.equal(result.solo[0].taskId, "3"); // independent group, not (sequential) — solo by construction, not by a gate failure
});
```

Add one test per eligibility row from Output Contract B (each asserting the offending task alone is forced solo and `advisories` contains a `BATCH_SOLO_FORCED` entry naming the failing row):
1. Group kind `(independent)` → both members solo (not a "failure", just not sequential — no `BATCH_SOLO_FORCED` for this one per Contract A/B's own framing, since independent groups were never candidates).
2. Group size `1` or `> max_batch_size` → solo, `BATCH_SOLO_FORCED` naming `size`.
3. A member routed `human-only` → only that member solo, `BATCH_SOLO_FORCED` naming `human-only`; the rest of the group still batches if it still satisfies every other row at its new (smaller) size.
4. A member needing a human checkpoint (`selected_agent: "assisted-agent"`) → same shape, `BATCH_SOLO_FORCED` naming `human-checkpoint`. **Scope note for AC3's second half** ("a test asserts the checkpoint still fires"): the pause-after-RED mechanism itself lives in `skills/implement/SKILL.md`'s 2a "Routing tag check" (line 345) as unmodified prose — no code in this repo executes it today, and no existing test in this repo asserts it fires (it is agent-instruction-only, the same category Task 4/5's doc-contract tests cover elsewhere in this plan). This task's test only proves the *gate* keeps such a task out of a batch; it does not and cannot prove the pause itself fires, because nothing in the current codebase proves that even in the unbatched, solo-dispatch case. Closing that pre-existing gap is out of scope for this spec.
5. A member crossing a governance boundary (`boundaryVerdicts["<id>"] === "FAIL"`) → same shape, naming `boundary`.
6. A member with unusable/out-of-range routing scores (missing sidecar entry, or a score outside `[0,1]`) → same shape, naming `routing-unusable`.

Also add:
- `--no-batch` (`noBatch: true`): every task solo regardless of grouping, no `BATCH_SOLO_FORCED` advisories (this is the operator's explicit choice, not a gate failure) — only `advisories` note the flag was honored.
- `implement.batch_mode: "off"` in the manifest: same as `--no-batch`.
- Malformed/absent `## Parallelization`: `resolveBatches` returns every task solo with a `serial: no/malformed parallelization section` advisory, mirroring `parseParallelizationSection`'s own `malformed: true` contract.
- **Abort carry-forward (Behavior E):** given `priorPlanTasks` showing task "1" as `status: "blocked"` from a previous run and task "2" still `pending`, the same group now resolves both "1" and "2" to solo — the batch is not re-formed — with an advisory naming the prior failure.

**Second suite, `tests/lib/implement/batch-verify.test.mjs`** — the artifact-level postconditions AC4 and AC6 need, mirroring how `lib/parallel/verify.mjs` checks commits actually landed rather than trusting the subagent's report:

```javascript
// tests/lib/implement/batch-verify.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { verifyHandoffBlocks, verifyNoReadAhead, verifyPerTaskReviewRounds } from "../../../lib/implement/batch-verify.mjs";

test("verifyHandoffBlocks: N task slugs produce N handoff-block files — AC4", () => {
  const dir = mkdtempSync(join(tmpdir(), "adev-handoff-"));
  try {
    writeFileSync(join(dir, "task-1-tests.md"), "# handoff 1\n");
    writeFileSync(join(dir, "task-2-tests.md"), "# handoff 2\n");
    const result = verifyHandoffBlocks({ packetsDir: dir, taskSlugs: ["task-1", "task-2"] });
    assert.equal(result.ok, true);
    assert.equal(result.count, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("verifyHandoffBlocks: a missing handoff file is reported by slug, not silently short-counted", () => {
  const dir = mkdtempSync(join(tmpdir(), "adev-handoff-"));
  try {
    writeFileSync(join(dir, "task-1-tests.md"), "# handoff 1\n");
    const result = verifyHandoffBlocks({ packetsDir: dir, taskSlugs: ["task-1", "task-2"] });
    assert.equal(result.ok, false);
    assert.deepEqual(result.missing, ["task-2"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("verifyNoReadAhead: passes when each packet read precedes the prior task's commit", () => {
  const result = verifyNoReadAhead({
    orderedTaskIds: ["1", "2", "3"],
    packetReadTimes: { "1": 100, "2": 250, "3": 400 },
    commitTimes: { "1": 200, "2": 350 },
  });
  assert.equal(result.ok, true);
});

test("verifyNoReadAhead: fails when task N+1's packet was read before task N's commit — AC6", () => {
  const result = verifyNoReadAhead({
    orderedTaskIds: ["1", "2"],
    packetReadTimes: { "1": 100, "2": 150 }, // read before commit below
    commitTimes: { "1": 200 },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.violations, [{ taskId: "2", precedingTaskId: "1", packetReadAt: 150, commitAt: 200 }]);
});

test("verifyPerTaskReviewRounds: passes when every batched task has both review stages recorded — AC5", () => {
  const result = verifyPerTaskReviewRounds({
    reviewRounds: {
      "p.plan.md::1::spec-compliance": { cycles: 1 },
      "p.plan.md::1::code-quality": { cycles: 2 },
      "p.plan.md::2::spec-compliance": { cycles: 1 },
      "p.plan.md::2::code-quality": { cycles: 1 },
    },
    plan: "p.plan.md",
    taskIds: ["1", "2"],
  });
  assert.equal(result.ok, true);
});

test("verifyPerTaskReviewRounds: fails and names the missing (task, stage) when a stage never ran — AC5", () => {
  const result = verifyPerTaskReviewRounds({
    reviewRounds: { "p.plan.md::1::spec-compliance": { cycles: 1 } }, // code-quality missing for task 1; task 2 absent entirely
    plan: "p.plan.md",
    taskIds: ["1", "2"],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, [
    { taskId: "1", stage: "code-quality" },
    { taskId: "2", stage: "spec-compliance" },
    { taskId: "2", stage: "code-quality" },
  ]);
});
```

This third function reuses `reviewRounds` — the projection `reportReviewRound()` / `currentState()` already fold `review_round` events into (`lib/lifecycle-state.mjs:2123`, keyed `${plan}::${task_id}::${stage}`), landed by the sibling spec `review-provenance.spec.md`. That spec's own frontmatter lists `enables: [batched-task-dispatch.spec.md, ...]` — it is not a peer being built alongside this one, it is a **prerequisite this spec was designed to consume**, and its `status: validated` / shipped `reportReviewRound()` + `reviewRounds` fold (confirmed at `lib/lifecycle-state.mjs:1267` and `:2123`) means the machinery AC5 needs already exists on disk today. No new event schema, no new fold case — `verifyPerTaskReviewRounds()` is a pure read over data Task 2 already reads via `currentState()` for the abort-carry-forward check, so this is a few extra lines in an already-open door, not new infrastructure.

- [ ] **Verify test fails**

Run: `node --test tests/lib/implement/batching.test.mjs tests/lib/implement/batch-verify.test.mjs`
Expected: FAIL — `Cannot find module '../../../lib/implement/batching.mjs'` / `'../../../lib/implement/batch-verify.mjs'`

- [ ] **Implement**

```javascript
// lib/implement/batching.mjs
//
// Resolves the plan's `## Parallelization` section plus manifest config,
// routing sidecar, governance boundary verdicts, and prior-run lifecycle
// state into a batch dispatch plan for /adev:implement's serial path.
// Pure function over already-loaded inputs — no I/O here; callers (the CLI
// verb in lib/cli/implement.mjs) own reading the plan file, manifest,
// routing sidecar, and lifecycle log.
//
// Spec: batched-task-dispatch.spec.md Output Contract A, B, E, F.

import { parseParallelizationSection } from "../parallel/groups.mjs";

const ELIGIBILITY_REASONS = {
  SIZE: "size",
  HUMAN_ONLY: "human-only",
  HUMAN_CHECKPOINT: "human-checkpoint",
  BOUNDARY: "boundary",
  ROUTING_UNUSABLE: "routing-unusable",
  PRIOR_FAILURE: "prior-failure",
};

export function resolveBatches({
  planContent,
  manifest,
  routingEntries = [],
  boundaryVerdicts = {},
  priorPlanTasks = {},
  noBatch = false,
  maxBatchOverride,
}) {
  const advisories = [];
  const maxBatchSize = maxBatchOverride ?? manifest?.implement?.max_batch_size ?? 4;
  const batchMode = manifest?.implement?.batch_mode ?? "on";

  if (noBatch || batchMode === "off") {
    const { groups, malformed } = parseParallelizationSection(planContent);
    const allTaskIds = malformed ? [] : groups.flatMap((g) => g.members);
    advisories.push({ type: "BATCH_DISABLED", reason: noBatch ? "--no-batch" : "implement.batch_mode: off" });
    return { batches: [], solo: allTaskIds.map((taskId) => ({ taskId, reason: null })), advisories };
  }

  const { groups, malformed } = parseParallelizationSection(planContent);
  if (malformed) {
    advisories.push({ type: "BATCH_SOLO_FORCED", reason: "serial: no/malformed parallelization section" });
    return { batches: [], solo: [], advisories };
  }

  const routingById = new Map(routingEntries.map((e) => [e.task_id, e]));
  const batches = [];
  const solo = [];

  for (const group of groups) {
    if (!group.independent) {
      const eligible = [];
      for (const taskId of group.members) {
        const reason = ineligibilityReason({ taskId, group, maxBatchSize, routingById, boundaryVerdicts, priorPlanTasks });
        if (reason) {
          solo.push({ taskId, reason });
          advisories.push({ type: "BATCH_SOLO_FORCED", taskId, reason });
        } else {
          eligible.push(taskId);
        }
      }
      // Re-check size after per-task eligibility narrowed the group.
      if (eligible.length >= 2 && eligible.length <= maxBatchSize) {
        batches.push({ group: group.id, taskIds: eligible });
        advisories.push({ type: "BATCH_DISPATCHED", group: group.id, taskIds: eligible, size: eligible.length });
      } else {
        for (const taskId of eligible) {
          solo.push({ taskId, reason: ELIGIBILITY_REASONS.SIZE });
          advisories.push({ type: "BATCH_SOLO_FORCED", taskId, reason: ELIGIBILITY_REASONS.SIZE });
        }
      }
    } else {
      for (const taskId of group.members) solo.push({ taskId, reason: null });
    }
  }
  return { batches, solo, advisories };
}

function ineligibilityReason({ taskId, group, maxBatchSize, routingById, boundaryVerdicts, priorPlanTasks }) {
  if (group.members.length < 2 || group.members.length > maxBatchSize) return ELIGIBILITY_REASONS.SIZE;
  const priorStatus = priorPlanTasks[taskId]?.status;
  if (priorStatus === "blocked" || priorStatus === "failed") return ELIGIBILITY_REASONS.PRIOR_FAILURE;
  const routing = routingById.get(taskId);
  if (!routing) return ELIGIBILITY_REASONS.ROUTING_UNUSABLE;
  if (routing.selected_agent === "human-only") return ELIGIBILITY_REASONS.HUMAN_ONLY;
  if (routing.selected_agent === "assisted-agent") return ELIGIBILITY_REASONS.HUMAN_CHECKPOINT;
  const scores = routing.scores || {};
  for (const v of Object.values(scores)) {
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) return ELIGIBILITY_REASONS.ROUTING_UNUSABLE;
  }
  if (boundaryVerdicts[taskId] === "FAIL") return ELIGIBILITY_REASONS.BOUNDARY;
  return null;
}
```

This is a sketch, not the final word — during implementation, adjust the exact advisory shapes to whatever `adev implement batches` (Task 3) needs to print cleanly, and confirm `priorPlanTasks[taskId]?.status === "blocked"` is really the right predicate against the actual `currentState().planTasks` shape (read `lib/lifecycle-state.mjs` around line 1777 for the authoritative field names before wiring the CLI verb's caller in Task 3).

`lib/implement/batch-verify.mjs`, the artifact-level postcondition checker:

```javascript
// lib/implement/batch-verify.mjs
//
// Post-hoc verification that a completed (or in-progress) batch actually
// produced what Contract C/D promise: one Handoff Block per task, and no
// task's context packet read before the preceding task's commit landed.
// Mirrors lib/parallel/verify.mjs's stance — check the artifact, don't
// trust the subagent's report — applied to batching instead of worktrees.
//
// Spec: batched-task-dispatch.spec.md Acceptance Criteria 4, 5, and 6.

import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * @param {{packetsDir: string, taskSlugs: string[]}} args
 * @returns {{ok: boolean, count: number, missing: string[]}}
 */
export function verifyHandoffBlocks({ packetsDir, taskSlugs }) {
  const missing = taskSlugs.filter((slug) => !existsSync(join(packetsDir, `${slug}-tests.md`)));
  return { ok: missing.length === 0, count: taskSlugs.length - missing.length, missing };
}

/**
 * @param {{orderedTaskIds: string[], packetReadTimes: Record<string, number>, commitTimes: Record<string, number>}} args
 * @returns {{ok: boolean, violations: Array<{taskId: string, precedingTaskId: string, packetReadAt: number, commitAt: number}>}}
 */
export function verifyNoReadAhead({ orderedTaskIds, packetReadTimes, commitTimes }) {
  const violations = [];
  for (let i = 1; i < orderedTaskIds.length; i++) {
    const taskId = orderedTaskIds[i];
    const precedingTaskId = orderedTaskIds[i - 1];
    const readAt = packetReadTimes[taskId];
    const commitAt = commitTimes[precedingTaskId];
    if (readAt !== undefined && commitAt !== undefined && readAt < commitAt) {
      violations.push({ taskId, precedingTaskId, packetReadAt: readAt, commitAt });
    }
  }
  return { ok: violations.length === 0, violations };
}

const REVIEW_STAGES = ["spec-compliance", "code-quality"];

/**
 * AC5: both review stages ran, per task, inside a batch. Reuses the
 * `reviewRounds` projection review-provenance.spec.md already ships
 * (`lib/lifecycle-state.mjs::currentState().reviewRounds`, keyed
 * `${plan}::${task_id}::${stage}`) — no new event, no new fold case.
 *
 * @param {{reviewRounds: Record<string, object>, plan: string, taskIds: string[]}} args
 * @returns {{ok: boolean, missing: Array<{taskId: string, stage: string}>}}
 */
export function verifyPerTaskReviewRounds({ reviewRounds, plan, taskIds }) {
  const missing = [];
  for (const taskId of taskIds) {
    for (const stage of REVIEW_STAGES) {
      if (!(`${plan}::${taskId}::${stage}` in reviewRounds)) missing.push({ taskId, stage });
    }
  }
  return { ok: missing.length === 0, missing };
}
```

`packetReadTimes` and `commitTimes` are supplied by the caller (Task 4's `batched-mode.md` instructs the batch agent to note each read/commit moment; Task 3's CLI verb or a future `/adev:recover`-style post-mortem pass derives them from `.context-index/packets/<slug>.md` mtimes and `git log` timestamps on the batch's commits — deriving them is out of scope for this plan's pure-function layer, matching how `lib/parallel/verify.mjs` itself takes `branch`/`base` and leaves the git plumbing to its CLI wrapper).

- [ ] **Verify test passes**

Run: `node --test tests/lib/implement/batching.test.mjs tests/lib/implement/batch-verify.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/implement/batching.mjs lib/implement/batch-verify.mjs tests/lib/implement/batching.test.mjs tests/lib/implement/batch-verify.test.mjs
git commit -m "feat(implementation): add resolveBatches() and batch-verify postconditions

Spec: .context-index/specs/features/implementation/batched-task-dispatch.spec.md
Plan-task: 2"
```

### Task 3: `adev implement batches` CLI verb [specialist: none]

**Charter capability:** Key Files — `skills/implement/SKILL.md` (this task is the deterministic CLI surface that SKILL.md's prose, in Task 5, will name instead of embedding grouping logic — cli-driver-surface charter).
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `lib/cli/implement.mjs:45-51` (subverb switch), `:125-139` (`help()`)
- Create: `tests/cli/implement-batches.test.mjs`

**Tests:** `tests/cli/implement-batches.test.mjs` (create — the existing `tests/cli/implement-read-routing.test.mjs` covers a different subverb of the same file and is not extended)

**Context to load:**
- `batched-task-dispatch.spec.md` — Arguments table (`--no-batch`, `--max-batch`, `CONFLICTING_BATCH_FLAGS`), Output Contract A's verb signature: `adev implement batches --plan <plan-path> [--max-batch <n>] [--no-batch]`
- `lib/cli/implement.mjs` (full — small file, add a case)
- `lib/cli/parallel.mjs` (full) — the `emit()`/`argErr()` helper pattern and its own `try { switch }` error-handling shape
- `lib/implement/batching.mjs` (from Task 2)
- `lib/plan-routing-sidecar.mjs` — `readRoutingSidecar()` throws `ROUTING_SIDECAR_MISSING`, which this verb must surface with the same exit code (2) the sibling `read-routing` subverb already uses (line 98-101 of `lib/cli/implement.mjs`), preserving the "unchanged from today" contract in the spec's Failure Modes table

- [ ] **Write failing test**

```javascript
// tests/cli/implement-batches.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(__dirname, "..", "..", "cli", "index.mjs");
const ENV = { ...process.env, NODE_OPTIONS: "" };

function run(...args) {
  return spawnSync("node", [CLI, "implement", "batches", ...args], { encoding: "utf8", env: ENV });
}

describe("adev implement batches", () => {
  it("exits 1 with CONFLICTING_BATCH_FLAGS when --no-batch and --parallel are both passed", () => {
    const r = run("--no-batch", "--parallel");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /CONFLICTING_BATCH_FLAGS/);
  });

  it("resolves an eligible batch from a plan + routing sidecar and prints JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "adev-batches-cli-"));
    try {
      const plan = join(dir, "p.plan.md");
      writeFileSync(plan, "## Parallelization\n\n- Group A (sequential): Task 1 → Task 2\n\n## Next\n");
      writeFileSync(join(dir, "p.routing.json"), JSON.stringify({
        version: 1, _generated_by: "test",
        entries: [
          { task_id: "1", selected_agent: "auto-agent", scores: { spec_completeness: 0.9, pattern_coverage: 0.8, blast_radius: 0.2, novelty: 0.3 }, rationale: "" },
          { task_id: "2", selected_agent: "auto-agent", scores: { spec_completeness: 0.9, pattern_coverage: 0.8, blast_radius: 0.2, novelty: 0.3 }, rationale: "" },
        ],
      }));
      const r = run("--plan", plan);
      assert.equal(r.status, 0);
      const out = JSON.parse(r.stdout);
      assert.equal(out.batches.length, 1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("exits 2 with ROUTING_SIDECAR_MISSING when the sidecar is absent", () => {
    const dir = mkdtempSync(join(tmpdir(), "adev-batches-cli-"));
    try {
      const plan = join(dir, "p.plan.md");
      writeFileSync(plan, "## Parallelization\n\n- Group A (sequential): Task 1 → Task 2\n\n## Next\n");
      const r = run("--plan", plan);
      assert.equal(r.status, 2);
      assert.match(r.stderr, /ROUTING_SIDECAR_MISSING/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("exits 1 with INVALID_MAX_BATCH_SIZE on a non-integer --max-batch", () => {
    const r = run("--plan", "irrelevant.plan.md", "--max-batch", "two");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /INVALID_MAX_BATCH_SIZE/);
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/implement-batches.test.mjs`
Expected: FAIL — `unknown subverb: batches`

- [ ] **Implement**

Add to `lib/cli/implement.mjs`'s subverb switch:

```javascript
case "batches":
  return cmdBatches(argv.slice(1));
```

```javascript
import { resolveBatches } from "../implement/batching.mjs";
import { readRoutingSidecar } from "../plan-routing-sidecar.mjs";
import { validateMaxBatchSize } from "../manifest.mjs"; // exported by Task 1

function cmdBatches(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        plan: { type: "string" },
        "max-batch": { type: "string" },
        "no-batch": { type: "boolean", default: false },
        parallel: { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
  } catch (err) {
    console.error(`argument error: ${err.message}`);
    process.exit(1);
  }
  const { values } = parsed;

  // Flag-conflict check runs BEFORE anything else, including --plan
  // presence, per the spec Arguments table: "Rejected with
  // CONFLICTING_BATCH_FLAGS when combined with --parallel."
  if (values["no-batch"] && values.parallel) {
    console.error(
      "CONFLICTING_BATCH_FLAGS: --no-batch and --parallel are mutually exclusive " +
      "— --parallel's unit of dispatch is already the group. Drop one flag.",
    );
    process.exit(1);
  }

  let maxBatchOverride;
  if (values["max-batch"] !== undefined) {
    const n = Number(values["max-batch"]);
    try {
      const holder = { max_batch_size: Number.isNaN(n) ? values["max-batch"] : n };
      validateMaxBatchSize(holder); // reuses Task 1's exact predicate + error code
      maxBatchOverride = holder.max_batch_size;
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }

  if (!values.plan) {
    console.error("--plan <plan-path> is required");
    process.exit(1);
  }

  // ... read plan file, manifest, routing sidecar (ROUTING_SIDECAR_MISSING → exit 2,
  //     matching cmdReadRouting's existing convention), current lifecycle state for
  //     priorPlanTasks, and boundary verdicts per task file list (checkBoundaries),
  //     then call resolveBatches({...}) and print the result as JSON, exit 0.
}
```

The elided middle (plan/manifest/lifecycle-state reads, per-task `checkBoundaries` calls) is deliberately left to implementation time rather than fully scripted here — it is straight-line plumbing over APIs already read in Task 2's context, and over-specifying it risks drifting from `resolveBatches`'s actual final parameter names. Wire it against the real signatures, not this sketch.

Update `help()` to document the new subverb and its exit codes (0 success, 1 argument error / `CONFLICTING_BATCH_FLAGS` / `INVALID_MAX_BATCH_SIZE` / `INVALID_BATCH_MODE`, 2 `ROUTING_SIDECAR_MISSING`).

- [ ] **Verify test passes**

Run: `node --test tests/cli/implement-batches.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/implement.mjs tests/cli/implement-batches.test.mjs
git commit -m "feat(implementation): add adev implement batches CLI verb

Spec: .context-index/specs/features/implementation/batched-task-dispatch.spec.md
Plan-task: 3"
```

### Task 4: `skills/implement/batched-mode.md` companion [specialist: none]

**Charter capability:** Key Behaviors — "TDD is enforced: RED → GREEN → REFACTOR"; Key Files — `skills/implement/SKILL.md` (this is the conditionally-loaded companion Task 5 points to, following the `parallel-mode.md` precedent).
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Files:**
- Create: `skills/implement/batched-mode.md`
- Create: `tests/skills/implement-batched-mode.test.mjs`

**Tests:** `tests/skills/implement-batched-mode.test.mjs` (create — doc-contract test, mirroring `tests/skills/implement-parallel.test.mjs`'s structure exactly, including its resolved-pointer read pattern)

**Context to load:**
- `batched-task-dispatch.spec.md` — Output Contract A (dispatch verb usage), C (five invariants preserved inside a batch), D (context hygiene — the read-ahead prohibition and per-task Handoff Block), E (abort semantics — stop at the failing task, commits stand, remaining tasks solo on re-run), F (advisories)
- `skills/implement/parallel-mode.md` (full) — the structural and tonal template
- `skills/implement/SKILL.md:466-653` (2d/2e/2f/2g/2h) — read, do not duplicate; batched-mode.md says "unchanged, run per task" and points at these, the way `parallel-mode.md`'s closing line does ("The per-task TDD loop, 2-stage review, and commit-per-task rules from Step 2 apply unchanged *inside* each worktree")

No inline Node in this file (constitution anti-pattern list) — this is prose naming the `adev implement batches` verb from Task 3, not executable JavaScript. No H3 headings here at all (it is one continuous H1-rooted section, like `parallel-mode.md`), so the "no both inline-Node and adev-verb in one H3" rule has no section boundary to violate.

- [ ] **Write failing test**

```javascript
// tests/skills/implement-batched-mode.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const skill = readFileSync(join(ROOT, "skills", "implement", "batched-mode.md"), "utf8");

describe("implement batched-mode companion", () => {
  it("names the resolving CLI verb, not inline grouping logic", () => {
    assert.match(skill, /adev implement batches/);
    assert.doesNotMatch(skill, /node --input-type=module -e/);
    assert.doesNotMatch(skill, /node -e ["']/);
  });

  it("states the read-ahead prohibition verbatim", () => {
    assert.match(skill, /MUST fully complete task/i);
    assert.match(skill, /[Rr]eading ahead is\s*\n?\s*forbidden/);
  });

  it("states one Handoff Block per task, not one per batch", () => {
    assert.match(skill, /N handoff blocks, not one/i);
  });

  it("states both review stages run per task and no group-level review is dispatched — AC5", () => {
    assert.match(skill, /[Bb]oth review stages/);
    assert.match(skill, /no group-level review/i);
  });
  // Doc-contract coverage here is deliberately paired with a MECHANICAL check
  // in Task 2/tests/lib/implement/batch-verify.test.mjs:
  // verifyPerTaskReviewRounds({reviewRounds, plan, taskIds}) asserts every
  // batched task has both a `${plan}::${taskId}::spec-compliance` and a
  // `${plan}::${taskId}::code-quality` entry in the `reviewRounds` projection
  // review-provenance.spec.md already ships (lib/lifecycle-state.mjs:2123),
  // giving AC5 the same evidentiary bar as AC4/AC6 rather than doc-contract
  // prose alone. (An earlier draft of this note incorrectly treated
  // review-provenance as a not-yet-shipped sibling; it is status: validated
  // and lists batched-task-dispatch as one of the specs it `enables`, so its
  // reviewRounds machinery is a prerequisite already on disk, not future work.)

  it("states batch abort semantics: commits stand, remaining tasks solo on re-run", () => {
    assert.match(skill, /never rolled back/i);
    assert.match(skill, /dispatched \*\*solo\*\*, regardless of\s*\n?\s*eligibility/i);
  });

  it("documents all three advisories", () => {
    assert.match(skill, /BATCH_DISPATCHED/);
    assert.match(skill, /BATCH_SOLO_FORCED/);
    assert.match(skill, /BATCH_ABORTED/);
  });

  it("preserves the anti-isolation guardrail inside a batch, same as parallel mode", () => {
    assert.match(skill, /Do not pass `isolation: "worktree"`|run_in_background: false/);
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/implement-batched-mode.test.mjs`
Expected: FAIL — `ENOENT: no such file or directory, open '.../skills/implement/batched-mode.md'`

- [ ] **Implement**

Draft `skills/implement/batched-mode.md` covering, in prose (structure and register matching `parallel-mode.md`):

1. **Header comment** — same "Companion to `skills/implement/SKILL.md`... Loaded conditionally" framing `parallel-mode.md` uses, adapted to name the batching axis instead of the parallelism axis.
2. **When this loads** — only when `implement.batch_mode` resolves to `on` (default) and `--no-batch` was not passed; batching applies to the serial path only (state the Relationship-to-`--parallel` table from the spec verbatim or near-verbatim, since it is the one piece of reasoning most likely to be mis-implemented if paraphrased).
3. **Resolving batches** — call `adev implement batches --plan <plan-path> [--max-batch <n>] [--no-batch]` once, before Step 2's per-task loop begins; print `BATCH_DISPATCHED` for each batch formed and `BATCH_SOLO_FORCED` for each task the gate pulled out, naming the failing eligibility row per the CLI verb's output.
4. **Dispatch shape** — for each formed batch, one `Agent({description, prompt, run_in_background: false})` call (never backgrounded, never `isolation: "worktree"` — same two guardrails Step 2d already states, restated here because this is a new dispatch site). The batch agent's prompt instructs it to process the batch's task ids **in order**, running the *full, unmodified* Step 2 loop (2.pre through 2h) for each task before touching the next one — explicitly: **both review stages (2f Stage 1 spec-compliance, then 2g Stage 2 code quality) run per task, at unchanged depth and cycle caps; no group-level review is dispatched, and no group-level fix commit is produced.** Batching the review itself is out of scope for this spec (Contract C.3) — state this plainly so an implementer does not "optimize" by reviewing the batch's diff once at the end.
5. **Read-ahead prohibition (Contract D)** — state verbatim: the batch agent MUST fully complete task *N* — RED, GREEN, both reviews, commit — before reading task *N+1*'s context packet; reading ahead is forbidden. Note (for implementers, not necessarily verbatim skill prose): `lib/implement/batch-verify.mjs::verifyNoReadAhead()` (Task 2) is the mechanical postcondition check for this — a future recovery/audit pass can compare each packet's file mtime against the preceding task's commit timestamp.
6. **Per-task Handoff Blocks (Contract D)** — a batch produces *N* handoff blocks, not one; each stays immutable and per-task, same as solo dispatch. Note: `lib/implement/batch-verify.mjs::verifyHandoffBlocks()` (Task 2) is the mechanical postcondition check for this; `verifyPerTaskReviewRounds()` in the same file is the analogous check for item 4's "both review stages per task" claim, reusing `review-provenance.spec.md`'s already-shipped `reviewRounds` projection.
7. **Abort semantics (Contract E)** — on any task inside the batch terminating non-`PASS` (the same `LOOP_NO_PROGRESS` / `LOOP_REGRESSED` / `LOOP_BUDGET_EXHAUSTED` verdicts 2g already defines, or a required governance gate failure from 2h), the batch agent stops at that task: prior completed tasks' commits stand and are never rolled back; the failing task and every later task in the batch stay open; emit `BATCH_ABORTED` naming the failing task and the tasks left open. On re-run, the remaining tasks in that group are dispatched **solo**, regardless of eligibility — state this is because a batch that already failed once has demonstrated its shared context is not helping, matching the spec's own reasoning.
8. **Closing line** — mirror `parallel-mode.md`'s closing sentence: "The per-task TDD loop, 2-stage review, and commit-per-task rules from Step 2 apply unchanged *inside* each batch; this section only governs which tasks share an agent and in what order."

- [ ] **Verify test passes**

Run: `node --test tests/skills/implement-batched-mode.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/implement/batched-mode.md tests/skills/implement-batched-mode.test.mjs
git commit -m "docs(implementation): add batched dispatch orchestration companion

Spec: .context-index/specs/features/implementation/batched-task-dispatch.spec.md
Plan-task: 4"
```

### Task 5: `SKILL.md` batched-dispatch wiring [specialist: none]

**Charter capability:** Key Files — `skills/implement/SKILL.md`.
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 4
**Files:**
- Modify: `skills/implement/SKILL.md:10-18` (Arguments), `:288-292` (Step 2 entry point), `:655-658` (conditional-loading pointer table, new row for `batched-mode.md`)

**Tests:** `tests/skills/implement-batched-mode.test.mjs` (extend — the doc-contract test from Task 4 already resolves the pointer the same way `implement-parallel.test.mjs` does; add assertions here for the base `SKILL.md` prose specifically, mirroring `implement-parallel.test.mjs`'s own split between base-skill assertions and companion-file assertions)

**Context to load:**
- `batched-task-dispatch.spec.md` — Arguments table (`--no-batch`, `--max-batch`), Invocation Modes section ("Default: batch cohesive groups, dispatch everything else solo"; "`--no-batch`: restore strict one-subagent-per-task"), Relationship to `--parallel` table, Failure Modes table (all 10 rows)
- `skills/implement/SKILL.md:1-54` (current Arguments/Prerequisites) and `:288-310` (Step 2 entry, before 2.pre) and `:655-664` (pointer table for 2.5 and 2-post) — read in full to find the exact insertion points
- `skills/implement/batched-mode.md` (from Task 4) — the pointer target

- [ ] **Write failing test**

Extend `tests/skills/implement-batched-mode.test.mjs` with assertions against the base `skillBody` (not the resolved companion), mirroring `implement-parallel.test.mjs`'s split:

```javascript
describe("SKILL.md batched-dispatch wiring", () => {
  it("documents --no-batch and --max-batch in Arguments", () => {
    assert.match(skillBody, /--no-batch/);
    assert.match(skillBody, /--max-batch <n>/);
  });

  it("rejects --no-batch combined with --parallel via CONFLICTING_BATCH_FLAGS", () => {
    assert.match(skillBody, /CONFLICTING_BATCH_FLAGS/);
  });

  it("points to batched-mode.md before the per-task loop begins", () => {
    assert.match(skillBody, /Read `skills\/implement\/batched-mode\.md`/);
  });

  it("documents all three batch advisories in the base skill or its companion", () => {
    const combined = skillBody + "\n" + readFileSync(join(ROOT, "skills", "implement", "batched-mode.md"), "utf8");
    for (const advisory of ["BATCH_DISPATCHED", "BATCH_SOLO_FORCED", "BATCH_ABORTED"]) {
      assert.match(combined, new RegExp(advisory));
    }
  });
});
```

(Add `import { readFileSync } from "node:fs";`-adjacent `ROOT`/`skillBody` constants at the top of the file if Task 4 did not already define them at module scope; reuse rather than redeclare.)

- [ ] **Verify test fails**

Run: `node --test tests/skills/implement-batched-mode.test.mjs`
Expected: FAIL — `skillBody` has no `--no-batch`, no pointer to `batched-mode.md`.

- [ ] **Implement**

In the **Arguments** section (after the existing `--fresh` line), add:

```markdown
- `--no-batch`: force solo dispatch for every task, restoring today's strict one-subagent-per-task behavior. Rejected with `CONFLICTING_BATCH_FLAGS` when combined with `--parallel` (`--parallel`'s unit of dispatch is already the group — the two flags would disagree about what "batching off" means).
- `--max-batch <n>`: per-run override of `implement.max_batch_size` (default 4). `1` is equivalent to `--no-batch`.
```

Immediately before **Step 2: Per-Task Execution Loop**'s existing text (i.e., right after the `### Step 2: Per-Task Execution Loop` heading and its "For each task in dependency order:" line, but before `#### 2.pre`), add a short paragraph:

```markdown
**Batch resolution (before the loop begins).** Unless `--no-batch` was passed or `implement.batch_mode` resolves to `off`, resolve the plan's batch dispatch shape once:

> **Conditional loading:** Read `skills/implement/batched-mode.md` for the full Batched Task Dispatch instructions.
> Load it only when at least one batch forms; a plan with no eligible `(sequential)` group runs the loop below exactly as written, per task.

`adev implement batches --plan <plan-path> [--max-batch <n>] [--no-batch]` resolves which tasks form a batch and which dispatch solo. When it forms at least one batch, `batched-mode.md` governs those tasks' dispatch; every other task in the plan still runs through 2.pre–2h below exactly as today.
```

Add a new row to the conditional-loading pointer table (same shape as the existing Step 2.5 / Step 2-post rows), or inline the pointer as shown above — whichever reads more naturally once the surrounding prose is in front of you; do not duplicate the pointer in both places.

Add the flag-conflict statement to the **Prerequisites** or **Arguments** section (wherever `--parallel` is already documented) so `CONFLICTING_BATCH_FLAGS` is discoverable without reading `batched-mode.md`:

```markdown
`--no-batch` and `--parallel` together are rejected with `CONFLICTING_BATCH_FLAGS` (checked by `adev implement batches` before it does anything else) — drop one flag.
```

- [ ] **Verify test passes**

Run: `node --test tests/skills/implement-batched-mode.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/implement/SKILL.md tests/skills/implement-batched-mode.test.mjs
git commit -m "feat(implementation): wire batched dispatch into implement SKILL.md

Spec: .context-index/specs/features/implementation/batched-task-dispatch.spec.md
Plan-task: 5"
```

### Task 6: Documentation updates [specialist: none]

**Charter capability:** Autonomous — "Updating internal documentation."
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3, Task 5
**Files:**
- Modify: `docs/cli-reference.md` (near line 477, the `adev implement read-routing` entry)
- Modify: `docs/skill-reference.md` (near lines 322-323, the `--parallel`/`--fresh` flag docs)
- Create: `tests/docs/batched-task-dispatch-docs.test.mjs`

**Tests:** `tests/docs/batched-task-dispatch-docs.test.mjs` (create — mirrors `tests/docs/test-depth-policy-docs.test.mjs`'s doc-consistency pattern: read the doc file, assert the new surface is named).

**Context to load:**
- `docs/cli-reference.md` (section around line 477) and `docs/skill-reference.md` (lines 315-335) — read the exact surrounding prose so the new entries match voice and formatting
- `batched-task-dispatch.spec.md` — Arguments table (verb signature, flag descriptions)
- `tests/docs/test-depth-policy-docs.test.mjs` — the doc-consistency test pattern this task's test mirrors

- [ ] **Write failing test**

```javascript
// tests/docs/batched-task-dispatch-docs.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(p) {
  return readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
}

test("docs/cli-reference.md documents adev implement batches", () => {
  const doc = read("docs/cli-reference.md");
  assert.match(doc, /adev implement batches/);
});

test("docs/skill-reference.md documents --no-batch and --max-batch", () => {
  const doc = read("docs/skill-reference.md");
  assert.match(doc, /--no-batch/);
  assert.match(doc, /--max-batch/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/docs/batched-task-dispatch-docs.test.mjs`
Expected: FAIL — neither doc mentions the new verb or flags yet.

- [ ] **Implement**

In `docs/cli-reference.md`, add an entry for `adev implement batches --plan <p> [--max-batch <n>] [--no-batch]` alongside the existing `adev implement read-routing` entry, describing its output shape (`{ batches, solo, advisories }`) and exit codes (0 success, 1 argument error / `CONFLICTING_BATCH_FLAGS` / `INVALID_MAX_BATCH_SIZE`, 2 `ROUTING_SIDECAR_MISSING`).

In `docs/skill-reference.md`, add `--no-batch` and `--max-batch <n>` to the `/adev:implement` flag list, next to the existing `--parallel` / `--fresh` entries, cross-referencing the Relationship-to-`--parallel` table from the spec in one sentence.

Optionally (small, only if it does not bloat scope): add a one-paragraph "Batched Dispatch" pointer to `docs/build-phase.md` next to its existing "Parallel Execution" section, linking the two concepts the way the spec's own Relationship table does.

- [ ] **Verify test passes**

Run: `node --test tests/docs/batched-task-dispatch-docs.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add docs/cli-reference.md docs/skill-reference.md tests/docs/batched-task-dispatch-docs.test.mjs
git commit -m "docs(implementation): document adev implement batches and --no-batch/--max-batch

Spec: .context-index/specs/features/implementation/batched-task-dispatch.spec.md
Plan-task: 6"
```

### Task 7: Equivalence eval harness [specialist: none]

**Charter capability:** Key Behaviors — "TDD is enforced" (the eval is the proof that batching does not weaken it); this is the spec's own release-blocking acceptance criterion (Output Contract G).
**Strategy:** unit (source: fallback, confidence: high) — the harness script itself is `[live]` (agent-driven, not run by `npm test`); only its `--dry-run` smoke path is unit-tested, matching the existing `worktree-parallelization` eval's own strategy classification.
**Depends on:** Task 2, Task 3, Task 5 (imports `verifyHandoffBlocks`/`verifyNoReadAhead` from Task 2's `lib/implement/batch-verify.mjs` directly, not just transitively through Task 3's CLI verb)
**Files:**
- Create: `tests/evals/batched-task-dispatch/fixture/example.plan.md`
- Create: `tests/evals/batched-task-dispatch/fixture/example.routing.json`
- Create: `tests/evals/batched-task-dispatch/run-ab-eval.mjs`
- Create: `tests/evals/batched-task-dispatch/run-ab-eval.smoke.test.mjs`

**Tests:** `tests/evals/batched-task-dispatch/run-ab-eval.smoke.test.mjs` (create — mirrors `tests/evals/worktree-parallelization/run-ab-eval.smoke.test.mjs`)

**Context to load:**
- `batched-task-dispatch.spec.md` — Output Contract G in full ("Equivalence is the load-bearing gate" — identical commit count and per-task commit contents, identical `plan_task` events, identical review outcomes)
- `tests/evals/worktree-parallelization/run-ab-eval.mjs` (full) and `.smoke.test.mjs` (full) — the 3-arm harness this plan's 2-arm harness mirrors structurally
- `tests/evals/worktree-parallelization/fixture/example.plan.md` (full) — the fixture-plan template
- `lib/parallel/eval/divergence.mjs` (full) — `judge()`, `testSetDivergence()`, `surfaceDivergence()`, reused verbatim (behavioral equivalence signals — test pass/fail set, public surface — are provider-agnostic; nothing here is parallel-specific)
- `lib/parallel/eval/report.mjs` (full) — `renderReport()`, `scoreRubric()`, reused verbatim
- `lib/implement/batching.mjs` (Task 2) — what the fixture plan + routing sidecar must produce when run through `resolveBatches()`

Unlike the 3-arm parallel eval (which needs a determinism-gate control arm because two independent agent runs of the *same* serial plan can already differ), this harness needs only 2 arms: `no-batch` (baseline — today's per-task dispatch) and `batched` (variant — the batch agent). A determinism-gate third arm is not required here because the fixture's `no-batch` arm IS the existing, already-shipped serial path — its determinism is not a new question this spec raises. `lib/parallel/eval/state-check.mjs` (`assertGroupSelection`, `assertNoOrphans`) is deliberately NOT reused — it asserts worktree-specific invariants (created worktree slugs, orphan scans) that do not exist under batching, which creates no worktree.

- [ ] **Write failing test**

```javascript
// tests/evals/batched-task-dispatch/run-ab-eval.smoke.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { planDryRun } from "./run-ab-eval.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "run-ab-eval.mjs");
const ENV = { ...process.env, NODE_OPTIONS: "" };

describe("batched-task-dispatch run-ab-eval --dry-run smoke", () => {
  it("prints both arms and the reused helper wiring", () => {
    const out = planDryRun();
    assert.match(out, /no-batch/);
    assert.match(out, /batched/);
    assert.match(out, /judge\(\)/);
    assert.match(out, /verifyHandoffBlocks\(\)/);
    assert.match(out, /verifyNoReadAhead\(\)/);
    assert.match(out, /verifyPerTaskReviewRounds\(\)/);
    assert.match(out, /batch=\[/); // fixture's eligible group surfaced
  });

  it("exits 0 and writes no results directory", () => {
    const r = spawnSync("node", [SCRIPT, "--dry-run"], { encoding: "utf8", env: ENV });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /DRY RUN/);
    assert.equal(existsSync(join(HERE, "results")), false, "dry-run must not write results/");
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/evals/batched-task-dispatch/run-ab-eval.smoke.test.mjs`
Expected: FAIL — `Cannot find module './run-ab-eval.mjs'`

- [ ] **Implement**

Fixture plan (`fixture/example.plan.md`), one eligible batch plus one ineligible solo task so the eval exercises both paths in a single fixture:

```markdown
# Fixture Plan: batched-dispatch-eval-fixture

## Parallelization

- Group A (sequential): Task 1 → Task 2 (shared file)
- Group B (independent): Task 3

## Task Summary
```

Matching `fixture/example.routing.json` giving tasks 1-3 `auto-agent` with usable scores (schema per `lib/plan-routing-sidecar.mjs`).

`run-ab-eval.mjs`, structured like the parallel eval's driver:

```javascript
#!/usr/bin/env node
// [live] 2-arm equivalence eval harness for /adev:implement batched dispatch
// (batched-task-dispatch.spec.md Output Contract G). Orchestrates two real
// agent runs of the fixture plan from identical clean checkouts — no-batch
// (baseline) and batched (variant) — captures the behavioral signals (test
// pass/fail set, public surface, plan_task events, commit count), then feeds
// them through the reused lib/parallel/eval/divergence.mjs `judge()` and
// lib/parallel/eval/report.mjs `renderReport()`/`scoreRubric()`.
//
// The full 2-arm run is [live] — requires agent access to run
// /adev:implement [--no-batch]; --dry-run prints the plan and helper wiring
// and writes nothing (exercised by the smoke test).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseParallelizationSection } from "../../../lib/parallel/groups.mjs";
import { judge } from "../../../lib/parallel/eval/divergence.mjs";
import { renderReport, scoreRubric } from "../../../lib/parallel/eval/report.mjs";
import { verifyHandoffBlocks, verifyNoReadAhead, verifyPerTaskReviewRounds } from "../../../lib/implement/batch-verify.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PLAN = join(HERE, "fixture", "example.plan.md");

const ARMS = [
  { id: "noBatch", role: "baseline", batch: false },
  { id: "batched", role: "variant", batch: true },
];

export function planDryRun() {
  const { groups } = parseParallelizationSection(readFileSync(FIXTURE_PLAN, "utf8"));
  const batch = groups.filter((g) => !g.independent).flatMap((g) => g.members);
  const lines = [
    "arms:",
    ...ARMS.map((a) => `  ${a.id} (${a.role})`),
    `batch=[${batch.join(", ")}]`,
    "helpers: judge() + renderReport()/scoreRubric() from lib/parallel/eval/*",
    "postconditions: verifyHandoffBlocks() + verifyNoReadAhead() + verifyPerTaskReviewRounds() from lib/implement/batch-verify.mjs",
  ];
  return lines.join("\n");
}

// ... [live] orchestration: for each arm, run /adev:implement [--no-batch] against
// a clean checkout of FIXTURE_PLAN, capture commit count + plan_task events +
// review outcomes + test pass/fail set + public surface. For the `batched` arm
// specifically, ALSO run the artifact-level postconditions from Task 2 against
// its real output — this is what closes the gap between "the checker functions
// are correct" (proven by tests/lib/implement/batch-verify.test.mjs against
// synthetic fixtures) and "a real batched run actually satisfies AC4/AC5/AC6":
//
//   const handoff = verifyHandoffBlocks({ packetsDir: batchedArm.packetsDir, taskSlugs: batchedArm.batchTaskSlugs });
//   const readAhead = verifyNoReadAhead({ orderedTaskIds: batchedArm.batchTaskIds, packetReadTimes: batchedArm.packetReadTimes, commitTimes: batchedArm.commitTimes });
//   const reviewRounds = verifyPerTaskReviewRounds({ reviewRounds: batchedArm.reviewRounds, plan: batchedArm.planPath, taskIds: batchedArm.batchTaskIds });
//   // fold handoff.ok / readAhead.ok / reviewRounds.ok into the rubric alongside
//   // judge(...)'s verdict — a batched run that diverges behaviorally per judge()
//   // but ALSO fails a postcondition should report both, not let one mask the
//   // other. `batchedArm.reviewRounds` is read straight off
//   // currentState(projectRoot, batchedArm.specPath).reviewRounds — no new
//   // capture logic beyond what Task 2 already reads for abort carry-forward.
//
// Then judge({...}) and renderReport(...). The exact fields on `batchedArm`
// (packetsDir, batchTaskSlugs, packetReadTimes, commitTimes, reviewRounds) depend on how the
// live orchestration captures them — left to implementation time, since this is
// agent-dispatch code, not something a plan snippet should fully script.

if (process.argv.includes("--dry-run")) {
  console.log("DRY RUN\n" + planDryRun());
  process.exit(0);
}
```

- [ ] **Verify test passes**

Run: `node --test tests/evals/batched-task-dispatch/run-ab-eval.smoke.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add tests/evals/batched-task-dispatch/
git commit -m "test(implementation): add batched-dispatch equivalence eval harness

Spec: .context-index/specs/features/implementation/batched-task-dispatch.spec.md
Plan-task: 7"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

`.context-index/governance/gates.yaml` exists, so its gate definitions govern (per the standard fallback rule) rather than the constitution's plain `npm test` line:

- **`test`** (deterministic, tier: fast, severity: error, triggers `post-task`/`post-implement`): `npm test`
- Type check: none configured (pure JS, no `tsc` gate in this repo)
- Lint: none configured as a `gates.yaml` entry today
- All acceptance criteria from `batched-task-dispatch.spec.md` satisfied, **including** the release-blocking equivalence eval (Task 7) — a batched run must judge equivalent to its `--no-batch` twin before this spec ships, per Output Contract G
- Regression check (Acceptance Criterion "`--parallel` behavior is unchanged by this spec; its existing equivalence eval still passes"): re-run `tests/skills/implement-parallel.test.mjs`, `tests/cli/parallel.test.mjs`, and `tests/evals/worktree-parallelization/run-ab-eval.smoke.test.mjs` unchanged — no task in this plan modifies `lib/parallel/*.mjs`, `skills/implement/parallel-mode.md`, or the parallel eval harness, so this is a verification step, not new work

