---
charter: worktree-parallelization
kind: behavioral
status: implemented
milestone: v1
revision: 2
charter-revision: 2
created: 2026-07-07
updated: 2026-07-07
source-manifest:
  sha: "abc9600"
  files:
    - cli/index.mjs
    - lib/cli/parallel.mjs
    - lib/parallel/baseline.mjs
    - lib/parallel/config.mjs
    - lib/parallel/gitignore.mjs
    - lib/parallel/groups.mjs
    - lib/parallel/verify.mjs
    - lib/worktree.mjs
    - skills/implement/SKILL.md
    - tests/cli/parallel.test.mjs
    - tests/lib/parallel/baseline.test.mjs
    - tests/lib/parallel/config.test.mjs
    - tests/lib/parallel/gitignore.test.mjs
    - tests/lib/parallel/groups.test.mjs
    - tests/lib/parallel/verify.test.mjs
    - tests/skills/implement-parallel.test.mjs
  computed-at: "2026-07-08T02:16:32.325Z"
---

# Live Spec: Parallel Implement

<!-- Standard mode. Defines /adev:implement --parallel and the merge-back semantics
     that consume the worktree primitive (see worktree-primitive.spec.md).
     Covers charter capabilities: parallel-implement, merge-back-semantics.
     rev 2: folds in review warnings SA-1/SA-2/SEC-1/SEC-2 + suggestions. -->

## Behavioral Contract

`/adev:implement --parallel` runs a plan's file-disjoint task groups concurrently, each in its own
adev-managed worktree, then merges the results back in a deterministic order. It changes *when* work
runs, never *what* the result is: a parallel run must be behaviorally equivalent to the serial run of
the same plan. **Correctness is guaranteed by the equivalence eval (`equivalence-eval.spec.md`), not
by any single runtime check** — the verifications below are sanity gates that fail fast, not proofs
of isolation.

The parallelization groups are **consumed, not computed** here — `/adev:plan` emits the
`## Parallelization` section (Group X = a file-disjoint set of tasks; tasks within a group run
sequentially; groups run concurrently). This spec owns only execution and merge-back.

### Error-code provenance

Codes marked *(primitive)* are surfaced by `worktree-primitive.spec.md`; codes without a marker are
owned by this spec.

### Behaviors

- **When** `/adev:implement --parallel` runs on a plan whose `## Parallelization` section parses into
  ≥2 independent groups **then** the orchestrator records its **pre-dispatch baseline** (current
  branch name + HEAD sha + clean-tree assertion), and for each independent group calls
  `adev worktree add --slug <plan-slug>-<group>` to create an isolated worktree.
- **When** a group's target worktree already exists from a prior run (retained after a failure)
  **then** the orchestrator does NOT re-dispatch into it (idempotent `add` would reuse stale partial
  commits). It aborts that group with `RERUN_COLLISION` and instructs the operator to inspect and
  `adev worktree remove --slug <…> --force` (or re-run with `--fresh` to auto-remove retained
  worktrees before dispatch).
- **When** a group subagent is dispatched **then** it is a bare `Agent({ description, prompt })` —
  **never** `isolation:"worktree"` — whose prompt binds it to the worktree: the subagent treats
  `<worktree-path>` as its working-tree root and MUST run **every** git and file operation against an
  absolute path or `git -C <worktree-path>` (never a relative op in the shared orchestrator cwd,
  which would race on `index.lock`). It executes the group's tasks sequentially (TDD + 2-stage review
  per the `implementation` charter) and commits each task to branch `adev/<plan-slug>-<group>`.
- **When** all group subagents have returned **then** the orchestrator JOINS (waits for all) before
  any merge-back and runs two verifications:
  1. **Orchestrator-baseline assertion (SA-2):** the orchestrator branch's HEAD still equals the
     recorded baseline sha and its working tree is clean. If a subagent mis-directed a commit or edit
     onto the orchestrator branch, this fails with `ORCHESTRATOR_POLLUTED` and the whole run aborts
     before any merge (no group is merged onto a polluted base).
  2. **Per-group completeness verification (SA-1):** for each group, the branch
     `adev/<plan-slug>-<group>` must contain a landed commit for **every** task in that group (matched
     via the plan-task/board `done` state, not merely "head advanced"). A group missing any task's
     commit fails with `COMMITS_NOT_VERIFIED` and is treated as failed, not merged.
- **When** the orchestrator merges verified groups back **then** it merges them into the orchestrator
  branch one at a time in deterministic order (plan dependency order, then lexicographic by slug) via
  `adev worktree merge --slug <…>`. The merge target is the **main root's current branch**, which the
  orchestrator guarantees is the orchestrator branch (it recorded that as the baseline). Because
  groups are file-disjoint by construction, inter-group merges do not conflict; a conflict can only
  arise against a concurrent external change and is handled per the error table.
- **When** a group's merge completes cleanly **then** that group's worktree and branch are removed
  **immediately** (`adev worktree remove --slug <…> --delete-branch`), so a crash mid-run never
  leaves a merged group's worktree behind to trip `RERUN_COLLISION`. When all groups have merged and
  been removed, the orchestrator reports success; the final tree is equivalent to a serial run.
- **When** a group fails (subagent error, `COMMITS_NOT_VERIFIED`, `RERUN_COLLISION`, or a merge
  conflict) **then** that group's worktree and branch are **retained for inspection**, its plan tasks
  remain open, the orchestrator still merges and cleans up the *successful* groups, prints a summary
  naming the failed group(s) and their retained worktree paths, and exits non-zero. Cross-group, the
  board is never left inconsistent; see the intra-group note in Postconditions.
- **When** `/adev:implement --parallel` is invoked but the `## Parallelization` section is absent OR
  unparseable (malformed grammar) OR yields 0/1 independent group, OR the current directory is inside
  a worktree (`adev worktree guard` reports `nested: true`), OR the `--parallel` flag is absent
  **then** the orchestrator falls back to the existing **serial** path unchanged, printing a one-line
  reason (`serial: no/malformed parallelization section` / `serial: single group` / `serial: nested
  in <kind> worktree`; no message when the flag is simply absent).
- **When** multiple group subagents write the shared issue board concurrently **then** the CAS-locked
  `JsonAdapter` serializes them (retrying on `STALE_BOARD_WRITE_RETRY`, with orphan-lock recovery via
  `cas_lock_stale_seconds`); every mutation lands, none is lost.

## Preconditions

- A reviewed, planned spec exists with a `.plan.md` containing a parseable `## Parallelization`
  section (else serial fallback applies).
- The worktree primitive (`worktree-primitive.spec.md`) is available (`adev worktree` verb).
- The invocation is NOT already inside a worktree (else serial fallback applies).
- The orchestrator is on the orchestrator branch with a clean tree at start (recorded as the
  baseline; merges target the main root's HEAD, which must be that branch).
- `implement.max_parallel` is read from `manifest.yaml` (default 4) and **clamped to a floor of 1**
  (a 0/negative/absurd value is corrected to 1, mirroring the `cas_lock_stale_seconds` floor).

## Postconditions

- On full success: the orchestrator branch contains all groups' commits; no `.adev/worktrees/`
  entries or `adev/*` branches for this plan remain; board reflects all tasks done.
- On partial success: successful groups merged + cleaned; failed groups' worktrees/branches retained;
  their tasks still open; a non-zero exit and a summary naming the retained paths.
- **Board consistency granularity:** cross-group, the board is never left inconsistent (each group's
  merge+mark-done is gated by that group's success). *Intra-group*, per-group merge and board-mark
  are two steps; a crash between them can leave a merged group's tasks briefly open — recovery is a
  re-run, which re-marks done idempotently (it does NOT re-dispatch a group whose worktree was
  already removed on success).
- The merged result is behaviorally equivalent to a serial run of the same plan — the equivalence
  eval (`equivalence-eval.spec.md`) is the load-bearing gate.

## Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `## Parallelization` absent or unparseable | Serial fallback with a warning to re-plan | (advisory) |
| 0 or 1 independent group | Serial fallback (`serial: single group`) | (advisory) |
| Invoked inside a worktree (`guard` nested) | Serial fallback (`serial: nested in <kind> worktree`) | (advisory) |
| Target worktree retained from a prior failed run | Abort that group; require removal or `--fresh` | `RERUN_COLLISION` |
| Orchestrator branch HEAD moved or tree dirty after join | Abort the whole run before any merge | `ORCHESTRATOR_POLLUTED` |
| A group's branch missing a commit for some group task | Treat as failed; do not merge; retain; report | `COMMITS_NOT_VERIFIED` |
| Group subagent returns an error | Retain worktree, leave tasks open, merge others, non-zero exit | `GROUP_FAILED` |
| Merge conflict against concurrent external change | `adev worktree merge` aborts cleanly; retain; report | `MERGE_CONFLICT` *(primitive)* |
| `adev worktree add` fails for a group | Abort that group before dispatch; run remaining; report | `ADD_FAILED` *(primitive)* |
| More independent groups than `implement.max_parallel` (≥1) | Run in bounded waves of `max_parallel` | (bounded, not an error) |

## Design Decisions (resolved from the charter's deferred fork)

- **cwd-binding = prompt-directed (forced).** The Agent dispatch exposes no working-directory or
  "use existing worktree" parameter; its only isolation option is the harness-managed
  `isolation:"worktree"` this module rejects. So the subagent is bound to its worktree by prompt, and
  every git/file op must be absolute or `git -C <worktree>`. **The commit-landing and orchestrator-
  baseline verifications are fail-fast sanity gates, NOT a proof of isolation** — a sufficiently
  misbehaved subagent could still corrupt state in ways only the equivalence eval detects. The eval
  is therefore the load-bearing correctness gate; the runtime checks exist to abort obviously-broken
  runs cheaply. If a future Agent dispatch gains a `cwd` parameter, amend to prefer tool-level
  binding (the verifications demote from correctness-adjacent gates to pure sanity checks).
- **Re-run safety.** Retained failed worktrees are never silently reused (idempotent `add` would
  merge stale partial commits); a re-run must remove them first (`RERUN_COLLISION` / `--fresh`).
- **Concurrency is bounded and floored** (`max_parallel` ≥ 1); waves change scheduling, not results.
- **Merge order is deterministic** (dependency order, then lexicographic) so a parallel run is
  reproducible and diffable against serial.
- **Partial failure is transactional-minded**: successes commit, failures are isolated and retained,
  the run exits non-zero so orchestrators (e.g. `/adev:build`) detect it, and no group merges onto a
  polluted orchestrator base.

## System Constitution Reference

- **Principle 2 (skills are primarily markdown)** — ✓ The `--parallel` orchestration is SKILL.md
  prose naming `adev worktree` verbs; no executable logic embedded in the skill.
- **Principle 1 (minimize dependencies)** — ✓ Built on the zero-dep primitive + git; no new deps.
- **`implementation` / `build` charter boundary** — ✓ This spec owns only the parallel orchestration
  and merge-back; the per-task TDD loop and 2-stage review inside each worktree remain governed by
  the `implementation` charter.

## Actionable Task Map

<!-- Preliminary — /adev:plan owns the full decomposition. -->

| Task | Description | Complexity |
|------|-------------|------------|
| 1 | Parse the plan's `## Parallelization` section (pinned grammar); serial fallback on absent/malformed | S |
| 2 | Record pre-dispatch baseline (branch, HEAD, clean tree); `RERUN_COLLISION` guard on retained worktrees | S |
| 3 | Orchestrator loop: `adev worktree add` per group; bounded-wave dispatch (`max_parallel` floored ≥1) of bare directed subagents with the absolute-path/`-C` prompt contract | M |
| 4 | Join + two verifications: `ORCHESTRATOR_POLLUTED` (baseline) and `COMMITS_NOT_VERIFIED` (per-group completeness against plan tasks) | M |
| 5 | Deterministic merge-back via `adev worktree merge`; conflict → retain + report | M |
| 6 | Partial-failure handling: retain failed, merge successes, non-zero exit, summary; `--fresh` flag | M |
| 7 | Serial fallback paths (no/malformed section, single group, nested, no flag) with stated reasons | S |
| 8 | Ensure `.adev/worktrees/` managed git-ignore block exists (claims the primitive's deferred gap) | S |
| 9 | `skills/implement/SKILL.md` prose for `--parallel` (keep the existing anti-`isolation:"worktree"` guardrail) | M |
| 10 | Tests: grammar parse + malformed fallback, baseline/pollution assertion, completeness verification, re-run collision, wave bounding, merge order, partial failure | L |

## Acceptance Criteria

- [ ] `--parallel` runs ≥2 independent groups each in its own `adev worktree`, dispatched as bare
      directed subagents (never `isolation:"worktree"`) bound via the absolute-path/`-C` contract.
- [ ] Post-join, the orchestrator asserts its branch HEAD == baseline + clean tree (`ORCHESTRATOR_POLLUTED` aborts the run before any merge).
- [ ] Per-group verification requires a landed commit for **every** group task (`COMMITS_NOT_VERIFIED` on partial commits) — not merely head-advanced.
- [ ] Re-running after a partial failure does not reuse a retained worktree (`RERUN_COLLISION`; `--fresh` auto-removes).
- [ ] Merges are deterministic; a full-success run's tree is equivalent to a serial run.
- [ ] Concurrency never exceeds `implement.max_parallel` and is floored at 1.
- [ ] A failed group is isolated (worktree retained, tasks open, others merged, non-zero exit).
- [ ] Serial fallback fires for no/malformed section, single group, nested, and no-flag, each with a stated reason.
- [ ] Concurrent board writes from parallel groups all land (no lost update).
- [ ] `.adev/worktrees/` is git-ignored (claims the primitive's deferred guarantee).
- [ ] The equivalence eval (`equivalence-eval.spec.md`) passes: parallel result ≡ serial result. **(load-bearing gate)**
- [ ] All quality gates pass; no constitutional violations.
