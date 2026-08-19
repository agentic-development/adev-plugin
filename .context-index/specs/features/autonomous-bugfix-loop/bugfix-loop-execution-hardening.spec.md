---
partial_schema: implement@1
charter: autonomous-bugfix-loop
status: implemented
mode: refactor
kind: refactor
milestone: 1
revision: 1
charter-revision: 12
created: 2026-08-21
updated: 2026-08-21
source-manifest:
  sha: "b1ea545"
  files:
    - docs/cli-reference.md
    - docs/skill-reference.md
    - lib/bugfix-loop-commit.mjs
    - lib/bugfix-loop-freshness.mjs
    - lib/bugfix-loop-run.mjs
    - lib/cli/bugfix-loop.mjs
    - package.json
    - scripts/run-tests.mjs
    - skills/bugfix-loop/SKILL.md
    - templates/manifest-template.yaml
    - tests/cli/bugfix-loop.test.mjs
    - tests/helpers.mjs
    - tests/integration/bugfix-loop-commit-pr-live.test.mjs
    - tests/integration/bugfix-loop-loop.test.mjs
    - tests/lib/bugfix-loop-commit.test.mjs
    - tests/lib/bugfix-loop-freshness.test.mjs
    - tests/lib/bugfix-loop-run.test.mjs
    - tests/skills/bugfix-loop-skill.test.mjs
    - tests/test-discovery.test.mjs
  computed-at: "2026-08-21T20:04:01.571Z"
drift_detected: true
---

# Refactoring Spec: Bugfix Loop Execution Hardening — Freshness, Isolation, Commit/PR Automation, Progress Reporting

<!-- Refactoring spec within the autonomous-bugfix-loop charter.
     Extends the Live Spec format with current-state/target-state analysis and migration path.
     Parent Charter: .context-index/specs/features/autonomous-bugfix-loop/charter.md
     Filed against adev-plugin-jogq (issue-ztjbt9). The --max-priority parameterization
     (Problem 5 / Improvement 5 / BEH-9/BEH-10 below) was added during spec authoring,
     beyond the issue's original four-item list. Full P0-P4 configurability (including
     P0/P1) required amending the already-shipped bug-selection-and-eligibility.spec.md;
     see bug-selection-and-eligibility-rev-8-configurable-priority-floor.spec.md and the
     charter (revision 12) for that change. This spec depends on that amendment shipping
     first, or landing in the same plan. -->

## Current State

<!-- Describe the code as it exists today. Be specific about files, patterns, and problems. -->

### Structure

| File | Role | Lines | Notes |
|------|------|-------|-------|
| `skills/bugfix-loop/SKILL.md` | Skill definition, Steps 0-6 | 167 | No freshness guard, no worktree isolation, no commit/PR automation, no summary table |
| `lib/bugfix-loop-run.mjs` | Run-state persistence (create/guard/finish/complete-turn) | — | No git branch-freshness helper, no summary-row storage |
| `lib/bugfix-loop-attempts.mjs` | Attempt recording, per-issue attempt cap | — | No commit/PR bookkeeping |
| `lib/cli/bugfix-loop.mjs` | CLI verb wiring for `adev bugfix-loop *` | — | No `check-freshness`, `worktree`, or `commit-pr` subverbs |

### Problems

1. No branch-freshness check: the loop can run for hours (one documented session ran 21 turns / 17 fixes) against a local branch that has drifted hundreds of files behind `origin/main`, discovered only once it's time to commit — after the cost of catching it is highest.
2. All fixes accumulate uncommitted in one shared working tree: a documented incident shows a model-ID substitution leaking into an unrelated marker-placement fix's diff, and a `blocker_id`/`finding_type` rewrite leaking into an unrelated model-routing fix's diff — both caught only by manual inspection before committing.
3. A `FIXED` verdict only updates the issue board (Step 4); the code change itself is never committed or opened as a PR by the loop, so a maintainer must reconstruct commits and PRs by hand after a long run (17 bugs, in the documented session).
4. No running progress visibility: turn output is easy to lose across a long unattended run; reconstructing verdict/files/tests-added history today requires replaying board history or git log after the fact.
5. Step 2 hardcodes the priority band: `adev issues next --type bug --max-priority P3 --json` bakes the literal `P3` into SKILL.md. The underlying `adev issues next` verb (`bug-selection-and-eligibility.spec.md`, already shipped) already accepts a configurable `--max-priority` bound, but its own BEH-8 hard-rejects `P0`/`P1` regardless of caller — so even a skill-level flag couldn't reach the full range without also changing that verb's shipped behavior. Neither the skill-level hardcoding nor the verb-level P0/P1 rejection is configurable today.

### Dependencies

- `/adev:debug --auto`'s own commit discipline is untouched — it does not commit today, and this refactor does not ask it to; committing is added at the bugfix-loop layer (new Step 4.5), after `record-attempt`.
- `adev issues claim/release` semantics (owner=`bugfix-loop`, branch tracking) are unchanged; worktree-per-bug reuses the same claim but records the per-bug worktree's branch instead of the starting tree's.
- `worktree-primitive.spec.md` (already shipped, `lib/worktree.mjs` + `adev worktree` CLI verb) is the reused isolation mechanism for `--worktree-per-bug` (Improvement 2) — this refactor does **not** introduce a new worktree library or CLI surface. It anchors created worktrees at `<mainRoot>/.adev/worktrees/<slug>` on branch `adev/<slug>`, deliberately outside `.claude/worktrees/` (the harness-reserved namespace `skills/build/SKILL.md` and `skills/implement/SKILL.md` both document as causing nested-worktree capture when reused by adev-created worktrees).
- `tracker-provider-bridge.spec.md`'s outbound writeback (existing Step 4) is sequenced before the new Step 4.5 commit/PR step and does not interact with it.
- `lib/loop-convergence.mjs` verdict semantics (reused by `per-issue-attempt-cap.spec.md`) are unaffected — commit/PR automation is orthogonal to attempt-cap bounding.
- `bug-selection-and-eligibility.spec.md` BEH-8 (base spec, shipped) hard-rejects `--max-priority P0`/`P1` at the `adev issues next` layer with `INVALID_PRIORITY_BOUND`. Full P0-P4 configurability at the skill level (Improvement 5 below) requires that rejection to be lifted at the verb layer too — see `bug-selection-and-eligibility-rev-8-configurable-priority-floor.spec.md` (amendment, target revision 8, already review-passed), which replaces BEH-8 while leaving BEH-7's unconditional module-exclusion floor untouched. This spec's Step 5 depends on that amendment.

## Target State

<!-- Describe what the code should look like after refactoring. -->

### Structure

| File | Role | Notes |
|------|------|-------|
| `skills/bugfix-loop/SKILL.md` | Skill definition, Steps 0-6 | Step 0/1 gains freshness guard + fail-fast `--max-priority` validation; new `--worktree-per-bug`/`--auto-commit`/`--max-priority` args; new Step 4.5; Step 4 gains summary-table print; Step 2's `adev issues next` call uses the parameter instead of a hardcoded `P3` |
| `lib/bugfix-loop-freshness.mjs` (new) | `git fetch` + ahead/behind computation against `origin/<default-branch>` | Node built-ins only (`child_process`) |
| `lib/worktree.mjs` (existing, reused unmodified) | Per-bug worktree create/remove/nesting-guard, via `add({slug, baseRef})`/`remove({slug, deleteBranch})` | No new worktree library. Bugfix-loop only adds a slug convention (`bugfix-<issue-id>`) and call sites in SKILL.md — see `worktree-primitive.spec.md` |
| `lib/bugfix-loop-commit.mjs` (new) | Commit-with-trailers, push, and `gh pr create` per bug | Shells to `git`/`gh` via `execFile`/`spawn` with argv arrays only — never a shell string (BEH-11); refuses, rather than sanitizes, WorkItem title/notes content unsafe for a commit-message/branch-name/PR-title context; degrades to a logged skip when `gh` is unavailable, mirroring `tracker-sync outbound`'s degrade pattern |
| `lib/cli/bugfix-loop.mjs` | CLI verb wiring | Gains `check-freshness`, `commit-pr`; `record-attempt` gains `--files-touched`/`--tests-added`/`--priority-bound`. No new worktree subverb — worktree lifecycle uses the existing `adev worktree add/remove --slug bugfix-<issue-id>` |
| `lib/bugfix-loop-run.mjs` | Run-state persistence | Gains `summary_rows[]` on the run-state record, appended by `record-attempt`, read by `finish` for the final table print |

### Improvements

1. `adev bugfix-loop check-freshness` (Step 0/1 guard) resolves Problem 1: fetches `origin/<default-branch>`, computes ahead/behind counts, warns above a configurable soft threshold and blocks above a hard threshold (both live in manifest, defaulting to warn-only so no existing invocation's pass/fail behavior changes until an operator opts into a hard block).
2. `--worktree-per-bug` (opt-in, or implied by `--github-sync` combined with a new `--auto-commit` flag) resolves Problem 2: each bug's claim (Step 3) through commit (Step 4.5) runs inside its own worktree at `<mainRoot>/.adev/worktrees/bugfix-<issue-id>` on branch `adev/bugfix-<issue-id>`, created via the already-shipped `adev worktree add --slug bugfix-<issue-id> --base-ref <ref>` (`worktree-primitive.spec.md`) and removed via `adev worktree remove` after commit — no two bugs' diffs ever coexist uncommitted in the same tree, and no new worktree library is introduced. `<ref>` is the loop's starting branch for the first bug attempted in a run, and the *previous bug's completed branch* (`adev/bugfix-<prev-issue-id>`) for every subsequent bug when `--worktree-per-bug` is active — this is what makes Improvement 3's PR stacking coherent: a worktree cannot be "stacked on the previous bug's branch" if it were instead always cut fresh from the loop's starting point.
3. Step 4.5 (`adev bugfix-loop commit-pr`) resolves Problem 3: on a `FIXED` verdict, commits the isolated diff with a descriptive message plus `Spec:`/`Issue:` trailers, pushes a branch, and opens a PR — stacked on the previous bug's branch when worktree-per-bug is active (per Improvement 2's `<ref>` resolution), else against main. `PARKED`/`UNREPRODUCIBLE` verdicts skip this step. Commit message, branch name, and PR title content derived from the WorkItem's title/notes is treated as untrusted (BEH-11) — a triage-gated GitHub-origin bug's title is not fenced or sanitized upstream (`tracker-provider-bridge.spec.md`), so this step must refuse rather than embed anything unsafe for a shell/git context.
4. The running summary table (Step 4, alongside `record-attempt`) resolves Problem 4: each attempt appends a row (`issue id | verdict | files touched | tests added | priority bound | turn`) to `run-state.summary_rows[]`; the table reprints in full after every attempt and once more in Step 5's finish output. The `priority bound` column is the `--max-priority` value in effect for that turn (Improvement 5) — recorded per the boundary reviewer's finding on `bug-selection-and-eligibility-rev-8-configurable-priority-floor.spec.md`, so a retroactive audit can identify which fixes were made under a widened P0/P1 floor versus the P3 default, per the charter's Auditability quality attribute.
5. A new `--max-priority <P0-P4>` argument on `/adev:bugfix-loop` resolves Problem 5: Step 2's `adev issues next` call uses the passed value instead of a hardcoded `P3`, defaulting to `P3` when omitted (today's exact behavior, unchanged). `P0`/`P1` are now reachable by explicit operator choice — this depends on `bug-selection-and-eligibility-rev-8-configurable-priority-floor.spec.md` (amendment) landing first, since the base verb's shipped BEH-8 rejects those values until that amendment ships. BEH-7's unconditional module-exclusion floor (a separate, non-amended mechanism) still applies regardless of priority.

## Changes Catalog

<!-- OpenSpec-style enumeration of what this refactor changes, classified by
     the kind of change. -->

### ADDED

- `lib/bugfix-loop-freshness.mjs` — branch-freshness computation (ahead/behind vs. `origin/<default-branch>`).
- `lib/bugfix-loop-commit.mjs` — commit + push + `gh pr create`, with trailers, stacked-branch base resolution, argv-array subprocess invocation, and title/notes content refusal (BEH-11).
- `adev bugfix-loop check-freshness` CLI verb.
- `adev bugfix-loop commit-pr` CLI verb.
- `--worktree-per-bug` and `--auto-commit` arguments on `/adev:bugfix-loop`.
- `--max-priority <P0-P4>` argument on `/adev:bugfix-loop` (default `P3`), threaded through to `adev issues next --max-priority` once the eligibility-floor amendment (target revision 8) ships.
- Step 4.5 in `skills/bugfix-loop/SKILL.md`.
- `summary_rows[]` field on the bugfix-loop run-state record.
- BEH-11 (subprocess safety / input-trust refusal), BEH-12 (excluded-module visibility passthrough), BEH-13 (crash-recovery orphan-worktree sweep) — see Behavioral Contract.

**No new worktree library or CLI verb.** `--worktree-per-bug` reuses the already-shipped `lib/worktree.mjs`/`adev worktree add|remove` (`worktree-primitive.spec.md`) directly; the earlier draft of this spec proposed a bespoke `lib/bugfix-loop-worktree.mjs` and `adev bugfix-loop worktree enter|exit`, anchored at `.claude/worktrees/bugfix-<issue-id>` — corrected during review (consistency-analyzer blocker) because that path collides with the harness-reserved `.claude/worktrees/` namespace and duplicates an existing, tested primitive.

### MODIFIED

- `skills/bugfix-loop/SKILL.md` Step 0/1 — gains the freshness guard call, plus fail-fast validation rejecting `--max-priority P0`/`P1` before any bug selection, both before the existing status/budget guard.
- `skills/bugfix-loop/SKILL.md` Step 2 — `adev issues next` call uses the resolved `--max-priority` value (default `P3`) instead of the literal `P3` string.
- `skills/bugfix-loop/SKILL.md` Step 3 — when `--worktree-per-bug` is active, calls `adev worktree add --slug bugfix-<issue-id> --base-ref <ref>` before claim; claim then happens inside that worktree, not the loop's starting tree.
- `skills/bugfix-loop/SKILL.md` Step 4.5 / Step 6 — call `adev worktree remove --slug bugfix-<issue-id>` after commit (or explicit skip) is confirmed (BEH-8).
- `skills/bugfix-loop/SKILL.md` Step 4 — gains the summary-table print immediately after `record-attempt`/`complete-turn`.
- `skills/bugfix-loop/SKILL.md` Step 5 (Finish) — reprints the full summary table before the terminal token.
- `skills/bugfix-loop/SKILL.md`'s manual `--resume` path (no `--resume-run-id`) — gains an orphaned-worktree sweep at start (BEH-13), matching Step 6's automatic sweep for the clean self-re-invocation path.
- `docs/cli-reference.md` and `docs/skill-reference.md` — updated for the new `bugfix-loop` subverbs (`check-freshness`, `commit-pr`) and skill args (`--worktree-per-bug`, `--auto-commit`, `--max-priority`).
- `adev bugfix-loop record-attempt` (`lib/cli/bugfix-loop.mjs`) — accepts `--files-touched`/`--tests-added`/`--priority-bound` to populate the new summary row. `--priority-bound` is the resolved `--max-priority` value for the current turn (Improvement 5) — the skill passes it through explicitly on every `record-attempt` call, the same resolved value it already threads into Step 2's `adev issues next` call, so no new run-state persistence or read-back is needed.
- Charter capability map: no row rename; this refactor extends the existing "`/adev:bugfix-loop` Skill" capability (milestone 1), not a new capability.

### REMOVED

(none)

### RENAMED

(none)

## Migration Path

<!-- Step-by-step plan for getting from current to target state. -->

### Step 1: Add branch-freshness guard

- **What:** Add `lib/bugfix-loop-freshness.mjs` and `adev bugfix-loop check-freshness --json`; wire it into SKILL.md Step 0/1 as a warn-by-default guard.
- **Why first:** Zero interaction with the commit/worktree machinery below; independently valuable and independently testable.
- **Risk:** Low — read-only `git fetch`/`rev-list` computation; default threshold is warn-only, so it changes no existing pass/fail behavior until an operator opts into a hard block.
- **Verification:** New unit tests for ahead/behind computation against a fixture repo; existing `tests/skills/bugfix-loop-skill.test.mjs` and `tests/integration/bugfix-loop-loop.test.mjs` pass unmodified.

### Step 2: Add per-bug worktree isolation (`--worktree-per-bug`), reusing the existing worktree primitive

- **What:** No new library or CLI verb. Wire `skills/bugfix-loop/SKILL.md` Step 3 to call `adev worktree add --slug bugfix-<issue-id> --base-ref <ref>` (`lib/worktree.mjs`, `worktree-primitive.spec.md`, already shipped) before claim, where `<ref>` is the loop's starting branch for the first bug and the previous bug's branch (`adev/bugfix-<prev-issue-id>`) for subsequent bugs when stacking is active; then claim, attempt (Step 4), and any resulting commit (Step 4.5) all run inside that worktree. Step 4.5/Step 6 call `adev worktree remove --slug bugfix-<issue-id>` once the commit (or explicit skip) is confirmed (BEH-8), and the manual `--resume` path sweeps for orphans the same way (BEH-13).
- **Why next:** Structurally independent of freshness (Step 1) and a prerequisite for safe commit/PR automation (Step 3 below) — committing per-bug diffs is only safe once they're isolated.
- **Why reuse, not build:** `lib/worktree.mjs` already provides slug validation (`SLUG_RE`, rejecting path-traversal before any git call), main-root anchoring (never nests, even when invoked from inside another worktree), idempotent `add`, and a `detectNesting` guard that classifies `.claude/worktrees/` as harness-reserved. Building a second, bespoke worktree module would duplicate all of this and — as an earlier draft of this spec did — risks landing worktrees inside the harness-reserved namespace, which `skills/build/SKILL.md` and `skills/implement/SKILL.md` both document as causing unbounded nesting and untracked-content capture.
- **Risk:** Medium — worktree create/remove still touches the filesystem outside the loop's own state, and the base-ref stacking logic (previous bug's branch, not always the loop's starting branch) is new integration surface even though the underlying primitive is proven. Mitigated by the primitive's own idempotent `add` and by BEH-8/BEH-13's bounded, never-retried cleanup on failure (Step 4's mitigation).
- **Verification:** New integration test simulating two bugs whose fixes touch overlapping files, asserting no cross-contamination in either worktree's diff; a test confirming the second bug's worktree branches from the first bug's completed branch (not the loop's starting branch) when stacking is active; existing loop tests still pass with the flag unset (default off, no behavior change).

### Step 3: Add commit + PR per bug (Step 4.5, depends on Step 2 for isolation)

- **What:** Add `lib/bugfix-loop-commit.mjs` and `adev bugfix-loop commit-pr`; wire as new Step 4.5, gated on a `FIXED` verdict and (`--worktree-per-bug` or `--auto-commit`). `lib/bugfix-loop-commit.mjs` invokes `git commit`/`git push`/`gh pr create` exclusively via `execFile`/`spawn` with argv arrays — never a shell string — and validates every token derived from WorkItem content (title, notes) against a safe-character allowlist before use (BEH-11), refusing rather than escaping or truncating an unsafe value, per this repo's established refuse-don't-sanitize posture (`governance-values.mjs`, `exec-payload.mjs`'s `GOVERNANCE_COMMAND_NOT_ARGV` refusal). A refused value falls back to a generic templated message keyed only by issue id (e.g. `"fix: <issue-id> (see attempt record)"`), never blocking the commit itself.
- **Why next:** Directly depends on Step 2 — committing an unisolated tree's diff would commit other bugs' in-flight changes too.
- **Why the refusal posture matters here specifically:** the charter's GitHub Issues bridge (`tracker-provider-bridge.spec.md`) lets a triage-gated but still-external GitHub filer's issue become a local WorkItem; that spec's own Interaction Contract fences `notes` in a nonce-scoped delimiter for `/adev:debug` Phase 1 reads but explicitly does **not** apply that fencing to `title` (only length-capped at 200 chars). This is the first place in the charter where that unfenced title could be interpolated into a shell/git context (commit message, branch name, PR title) rather than just read as text — BEH-11 exists specifically to close that gap here rather than assume upstream fencing already covers it.
- **Risk:** Medium — shells to `gh pr create`, an external dependency that can be unauthenticated or rate-limited, plus the argv-safety/refusal logic above is new attack-surface-relevant code. Mitigated with the same degrade-gracefully pattern as `tracker-sync outbound` for the external-dependency risk, and with BEH-11's refuse-not-sanitize contract plus argv-array invocation for the injection risk.
- **Verification:** New tests mocking `gh`/`git` push failures, asserting the loop continues; a real (non-mocked) integration test behind the existing `ci_tag: integration` gate for the happy path; a new adversarial test asserting a WorkItem title containing shell metacharacters (`; rm -rf`, `` ` ``, `$(...)`) is refused (falls back to the generic templated message) rather than interpolated, and that the underlying `git`/`gh` calls are asserted to run via argv-array invocation (mocking `child_process.execFile`/`spawn`, never `exec`).

### Step 4: Add per-bug summary table

- **What:** Add `summary_rows[]` to the run-state record; extend `record-attempt` to accept `--files-touched`/`--tests-added`/`--priority-bound`; print the running table after each attempt and in the Step 5 finish output. `--files-touched` is computed via `git diff --stat` against the attempt's tree (the per-bug worktree when `--worktree-per-bug` is active, else the loop's shared tree) immediately before `record-attempt` is called in Step 4 — a plain file count, not parsed from `/adev:debug --auto`'s own output. `--tests-added` is computed the same way, counting files under `tests/` that are new or have added lines in that same `git diff --stat` output. `--priority-bound` is the resolved `--max-priority` value already available from Step 0/2 (Improvement 5) — no new computation, just passed through.
- **Why last:** Purely additive reporting — no other step depends on it, and it depends on nothing but the existing `record-attempt` call, so it's safe to land whenever convenient without blocking Steps 2-3.
- **Risk:** Low — output formatting only, no control-flow change.
- **Verification:** Snapshot test of table formatting; existing tests unaffected since the table is additive stdout, not a new gate.

### Step 5: Parameterize the priority filter (`--max-priority`, depends on the eligibility-floor amendment)

- **What:** Add a `--max-priority <P0-P4>` argument to `/adev:bugfix-loop`; validate it at Step 0 (reject only malformed values — `P0`/`P1` are now legal, matching `adev issues next`'s amended BEH-8); pass the resolved value (default `P3`) into Step 2's `adev issues next` call instead of the hardcoded literal. When the resolved value is `P0`/`P1`, `adev issues next` additionally prints the effective excluded-module set to stderr per the amendment's BEH-12 (`bug-selection-and-eligibility-rev-8-configurable-priority-floor.spec.md`) — this spec's own BEH-12 (below) makes that a concrete, tested contract: Step 2's invocation must not redirect or suppress stderr, so the printed set reaches the turn's transcript verbatim.
- Also update `docs/cli-reference.md`'s `bugfix-loop` verb signature and `docs/skill-reference.md`'s bugfix-loop entry for every new subverb/arg introduced across Steps 1-5 (`check-freshness`, `commit-pr`, `--worktree-per-bug`, `--auto-commit`, `--max-priority`), matching the pattern the amendment spec already establishes for its own doc-update criterion.
- **Why last, and why it depends on the amendment:** `adev issues next`'s shipped BEH-8 rejects `P0`/`P1` until `bug-selection-and-eligibility-rev-8-configurable-priority-floor.spec.md` ships and is implemented — this step cannot deliver full P0-P4 configurability before that amendment lands (either in the same plan or an earlier one). It remains independent of Steps 1-4 (freshness/worktree/commit-PR) — no ordering constraint against those.
- **Risk:** Medium — this is a genuine safety-boundary change, not a pass-through to an unchanged floor. BEH-7's unconditional module-exclusion list is the mitigation: it stays untouched and still excludes any bug tagged against a reserved safety module (`review-gate`, `convergence-detector`, `retry-loop`, `bugfix-loop`) regardless of `--max-priority`, including `P0`. Risk is scoped to bugs that are high-priority *and* in an ordinary, non-excluded module — exactly the case an operator is opting into by passing `--max-priority P0`/`P1` explicitly.
- **Verification:** New test confirming `--max-priority P0`/`P1` now succeeds and is passed through; a malformed-value test still rejects with `INVALID_PRIORITY_BOUND`; an explicit regression test confirming a `P0` WorkItem tagged against a reserved safety module is still excluded even with `--max-priority P0` set (BEH-7 unaffected); a test confirming BEH-12's excluded-module stderr output actually reaches the turn's transcript when `--max-priority P0`/`P1` is used (not redirected or swallowed by Step 2's invocation).

## Invariants

- [ ] All existing tests continue to pass at every step
- [ ] Public API contracts do not change — existing `adev bugfix-loop` verbs (`create`, `guard`, `finish`, `complete-turn`, `latest`) keep their current flags and JSON shapes; new flags/verbs are additive only
- [ ] No data loss or corruption during migration — worktree removal never runs before its commit (or explicit skip) is confirmed
- [ ] The loop never halts on a degraded external dependency (`gh` unreachable, push rejected) — it logs and continues, per the existing Failure Modes discipline
- [ ] `--worktree-per-bug` and `--auto-commit` default OFF — no existing invocation's behavior changes without an explicit new flag
- [ ] `--max-priority` accepts the full `P0`-`P4` range once the eligibility-floor amendment ships; BEH-7's unconditional module-exclusion floor (unaffected by this refactor or the amendment) still excludes any bug tagged against a reserved safety module regardless of priority — that remains the actual, non-configurable safety boundary
- [ ] Every `git`/`gh` invocation added by this refactor (worktree add/remove via the existing primitive, commit, push, `gh pr create`) uses argv-array invocation (`execFile`/`spawn`); none is ever built as a shell string
- [ ] Every worktree slug is validated by `lib/worktree.mjs`'s `SLUG_RE` before any git call regardless of the issue id's provenance (defense-in-depth; today's local issue ids are always system-generated, never derived from external GitHub content, but the validation applies unconditionally)
- [ ] Commit message, branch name, and PR title content derived from a WorkItem's `title`/`notes` is refused (not sanitized, truncated, or escaped) when it contains characters unsafe for a shell/git context — a refused value falls back to a generic templated message, never to a partially-cleaned one
- [ ] The consent model for `--auto-commit`/`--worktree-per-bug` is coarse-grained by design: one flag, passed once at run start, authorizes an unbounded number of automated commits/pushes/PRs across every subsequent turn of a potentially long unattended run — this is a deliberate tradeoff (matching the flag's own scope, a whole run, not a per-artifact or per-install consent union), not an oversight

## Behavioral Contract

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** `/adev:bugfix-loop` starts a turn (Step 0/1) **then** it runs `adev bugfix-loop check-freshness` and prints a warning naming the ahead/behind counts when the local branch is behind `origin/<default-branch>` beyond the configured soft threshold, without halting the run.
- **BEH-2** — **When** the configured hard threshold is exceeded **then** the loop halts before selecting a bug, finishing with `--status blocked` and the `BLOCKED` token, naming the freshness gap in the finish note.
- **BEH-3** — **When** `--worktree-per-bug` is set and a bug is claimed (Step 3) **then** `adev worktree add --slug bugfix-<issue-id> --base-ref <ref>` runs first, and the claim, the `/adev:debug --auto` attempt (Step 4), and any resulting commit all happen entirely inside the resulting worktree at `<mainRoot>/.adev/worktrees/bugfix-<issue-id>` on branch `adev/bugfix-<issue-id>`, isolated from every other bug's in-flight changes.
- **BEH-4** — **When** a bug's attempt resolves `FIXED` and (`--worktree-per-bug` or `--auto-commit`) is set **then** Step 4.5 commits the isolated diff with a descriptive message and `Spec:`/`Issue:` trailers, pushes `adev/bugfix-<issue-id>`, and opens a PR — against main when worktree-per-bug is inactive; when worktree-per-bug is active, `<ref>` in BEH-3 was already resolved to the previous bug's completed branch (or the loop's starting branch for the first bug), so the PR is naturally stacked on that base.
- **BEH-5** — **When** a bug's attempt resolves `PARKED` or `UNREPRODUCIBLE` **then** Step 4.5 is skipped entirely — nothing is committed or pushed for that bug.
- **BEH-6** — **When** each attempt completes (Step 4) **then** a summary row (issue id, verdict, files touched, tests added, `--max-priority` bound in effect, turn number) is appended and the full running table is reprinted to the turn's output.
- **BEH-7** — **When** `gh pr create` or the push in Step 4.5 fails (auth, network, rate limit) **then** the failure is logged, the bug's `AttemptRecord` and board state (already written in Step 4) are unaffected, and the loop continues to Step 6 without halting.
- **BEH-8** — **When** Step 6 self-re-invokes after a `--worktree-per-bug` turn **then** it attempts once to verify no `bugfix-<issue-id>` worktree from the just-completed bug remains under `.adev/worktrees/`, calling `adev worktree remove --slug bugfix-<issue-id>` if the commit (or explicit skip) already landed. **When** that single `adev worktree remove` attempt itself fails (the primitive's `REMOVE_FAILED` — permission error, stale lock, filesystem issue — distinct from the deliberate "uncommitted diff" skip in `WORKTREE_REMOVAL_DEFERRED`) **then** the failure is logged as a non-blocking advisory and Step 6 proceeds to self-re-invoke anyway — cleanup is never retried and never blocks the next turn. This mirrors the loop's existing "never halt on a degraded external dependency" discipline (Failure Modes): an orphaned worktree from a failed removal is a cleanup debt for the operator to notice later, not a reason to stall an otherwise-healthy unattended run.
- **BEH-9** — **When** `/adev:bugfix-loop` is invoked with `--max-priority <p>` where `<p>` is any of `P0`-`P4` **then** every turn's Step 2 `adev issues next` call uses `<p>` as its `--max-priority` bound; omitting the flag resolves to `P3`, identical to today's hardcoded default. Selecting `P0`/`P1` is a deliberate, explicit operator choice — it is no longer rejected.
- **BEH-10** — **When** `/adev:bugfix-loop` is invoked with a malformed `--max-priority` value (not `P0`-`P4`) **then** the run halts at Step 0 before any bug is selected, finishing with `--status blocked` and the `BLOCKED` token, naming the rejected value — the loop never reaches Step 2 to let `adev issues next` discover the same rejection per turn.
- **BEH-11 (subprocess safety)** — **When** `lib/bugfix-loop-commit.mjs` invokes `git commit`/`git push`/`gh pr create` **then** it does so exclusively via `execFile`/`spawn` with an argv array, never a shell string, and any WorkItem-derived content (title, notes) destined for a commit message, branch name, or PR title is validated against a safe-character allowlist first. **When** that content contains characters unsafe for the target context **then** the value is refused outright — not sanitized, escaped, or truncated — and a generic templated message keyed only by issue id is used instead.
- **BEH-12 (excluded-module visibility passthrough)** — **When** Step 2's `adev issues next` call is made with `--max-priority P0` or `P1` **then** the skill does not redirect or suppress the verb's stderr output, so the amendment's BEH-12 (excluded-module set) reaches the turn's transcript verbatim, every time.
- **BEH-13 (crash-recovery orphan sweep)** — **When** `/adev:bugfix-loop --resume` is invoked without `--resume-run-id` (the manual crash-recovery path, via `adev bugfix-loop latest`) and `--worktree-per-bug` was active in the recovered run **then** it performs the same orphan-worktree check as BEH-8 before claiming a new bug — a worktree left behind by a hard crash (not a clean Step 6 exit) is swept the same way, so the resumed run does not silently accumulate orphaned worktrees from the crashed attempt.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|--------------------------|
| `origin` remote unreachable during `check-freshness` fetch, or any other `check-freshness` failure (malformed `git` output, detached HEAD, unexpected non-zero exit) | Degrade to a logged warning ("freshness check skipped — <reason>"); do not block the run — this degrade path is total, not limited to the origin-unreachable case | `FRESHNESS_CHECK_DEGRADED` |
| Hard freshness threshold exceeded | Halt before bug selection; finish `--status blocked`; `BLOCKED` token | `BRANCH_STALE_BLOCKED` |
| `adev worktree add` fails (dirty state, path collision — the primitive's `ADD_FAILED`) | Turn ends without an attempt for that bug (mirrors the existing 3-retry claim-failure path); release the claim; continue to Step 2 for the next bug | `ADD_FAILED` (from `worktree-primitive.spec.md`) |
| `gh` CLI missing or unauthenticated during commit-pr | Skip commit/PR for that bug only, log the reason; `AttemptRecord`/board state unaffected | `COMMIT_PR_SKIPPED` |
| Push rejected (e.g., branch name collision) | Same degrade as above — logged skip, no halt | `COMMIT_PR_SKIPPED` |
| WorkItem title/notes content unsafe for a commit-message/branch-name/PR-title context (BEH-11) | Refuse the value; fall back to a generic templated message keyed only by issue id; commit/PR still proceeds | `UNSAFE_COMMIT_CONTENT` |
| Worktree removal requested while an uncommitted diff remains and `FIXED` was not committed (e.g., commit-pr skipped) | Do not remove; leave the worktree for manual recovery, log its path | `WORKTREE_REMOVAL_DEFERRED` |
| `adev worktree remove` command itself fails (the primitive's `REMOVE_FAILED` — permission error, stale lock, filesystem issue) at Step 6 or the BEH-13 crash-recovery sweep | Log as a non-blocking advisory naming the worktree path; do not retry; proceed to self-re-invoke (or resume) — never stalls the run | `REMOVE_FAILED` (from `worktree-primitive.spec.md`) |
| Malformed `--max-priority` value (not `P0`-`P4`) passed to `/adev:bugfix-loop` | Halt at Step 0, before bug selection; finish `--status blocked`; `BLOCKED` token naming the rejected value | `INVALID_PRIORITY_BOUND` |
| `--max-priority P0`/`P1` requested before the eligibility-floor amendment is implemented (base verb still on shipped BEH-8) | `adev issues next` itself rejects with `INVALID_PRIORITY_BOUND`; the loop surfaces this as `BLOCKED` at Step 0 — resolved once the amendment ships | `INVALID_PRIORITY_BOUND` (transitional) |

## System Constitution Reference

- **Principle:** "Minimize external dependencies — prefer Node.js built-ins" — Applies because `bugfix-loop-freshness.mjs` and `bugfix-loop-commit.mjs` shell out to `git`/`gh` via `child_process`, not a new npm dependency; and because `--worktree-per-bug` reuses the already-shipped `lib/worktree.mjs` rather than introducing a second worktree implementation (no duplicated logic, per this review's consistency finding).
- **Principle:** Hook/CLI protocol convention — Applies because every new `adev bugfix-loop` subverb follows the existing exit-code/JSON-to-stdout convention shared by the rest of the verb family.
- **Principle:** "No `Run inline Node.js:` step directives ... inside `skills/*/SKILL.md`" — Applies because Step 4.5 and the freshness guard are both named as `adev bugfix-loop <verb>` invocations in SKILL.md, with all control flow living in `lib/` modules.
- **Principle:** Commit trailer policy ("Commits that implement or fix spec-tracked work must include a `Spec:` trailer") — Applies directly: Step 4.5's generated commit message includes `Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-execution-hardening.spec.md` and the originating issue reference.
- **Principle:** "Be careful not to introduce security vulnerabilities such as command injection" (root CLAUDE.md) — Applies directly to BEH-11: every new shell-out point uses argv-array invocation, and WorkItem-derived content feeding a commit message/branch name/PR title is refused, not sanitized, when unsafe.

## Acceptance Criteria

- [ ] All current tests pass without modification
- [ ] New tests cover: freshness ahead/behind computation, worktree isolation via the reused `lib/worktree.mjs` primitive (no cross-fix contamination; base-ref stacking on the previous bug's branch), commit-pr happy path + degrade paths, argv-array subprocess invocation + refuse-not-sanitize handling of unsafe WorkItem content (BEH-11), excluded-module stderr passthrough (BEH-12), crash-recovery orphan sweep (BEH-13), summary-table formatting including the `--priority-bound` column, `--max-priority` fail-fast rejection of malformed values only and pass-through of the full P0-P4 range (once the eligibility-floor amendment ships)
- [ ] Problems 1-5 listed in Current State are resolved per the Target State mapping
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced
- [ ] `--worktree-per-bug` and `--auto-commit` default OFF; existing invocations without these flags behave identically to pre-refactor behavior
- [ ] No new worktree library or CLI verb was introduced; `--worktree-per-bug` uses only `lib/worktree.mjs`/`adev worktree add|remove`, and no created worktree ever resolves under `.claude/worktrees/`
- [ ] `docs/cli-reference.md` and `docs/skill-reference.md` are updated for every new `bugfix-loop` subverb and skill argument introduced by this refactor
