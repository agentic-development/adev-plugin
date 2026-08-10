# Implementation Plan: Parallel Implement

> **Methodology:** adev
> **Charter:** .context-index/specs/features/worktree-parallelization/charter.md
> **Spec:** .context-index/specs/features/worktree-parallelization/parallel-implement.spec.md
> **Review:** PASS_WITH_NOTES (2026-07-07) — rev 2 folded in SA-1/SA-2/SEC-1/SEC-2
> **Platform:** Node.js (ESM, .mjs), zero-dependency, node:test

**Goal:** Build the `/adev:implement --parallel` consumer: read the plan's `## Parallelization` groups, run file-disjoint groups concurrently in adev-managed worktrees, verify, and merge back — result-equivalent to serial.

**Architecture:** The worktree primitive (`lib/worktree.mjs` + `adev worktree` verb) is already built and tested (20 tests). This plan adds the deterministic orchestration helpers in **file-disjoint `lib/parallel/*` modules** (each independently testable — and a natural dogfood target for this very feature), a thin `adev parallel` CLI verb wiring them, the `--parallel` orchestration prose in `skills/implement/SKILL.md`, plus two coverage-gap fixes (baseRef hardening in the primitive; the `.adev/worktrees/` managed git-ignore block). The agent-side dispatch/merge loop lives in SKILL.md prose (Principle 2); every deterministic decision (parse, baseline, verify, merge-order, clamp, collision) lives in a lib helper behind the CLI verb (cli-driver-surface).

---

## File Structure

**Create:**
- `lib/parallel/groups.mjs` — parse `## Parallelization`, compute deterministic merge order
- `lib/parallel/baseline.mjs` — record pre-dispatch baseline; assert orchestrator unpolluted (`ORCHESTRATOR_POLLUTED`)
- `lib/parallel/verify.mjs` — per-group completeness verification (`COMMITS_NOT_VERIFIED`)
- `lib/parallel/config.mjs` — `max_parallel` clamp (floor 1); retained-worktree collision detection (`RERUN_COLLISION`)
- `lib/cli/parallel.mjs` — `adev parallel <groups|baseline|verify|config>` verb (run/help contract)
- `tests/lib/parallel/groups.test.mjs`, `baseline.test.mjs`, `verify.test.mjs`, `config.test.mjs`
- `tests/cli/parallel.test.mjs`
- `lib/parallel/gitignore.mjs` — ensure managed `.adev/worktrees/` ignore block
- `tests/lib/parallel/gitignore.test.mjs`

**Modify:**
- `cli/index.mjs` — register `["parallel", …]` in `VERB_REGISTRY`
- `lib/worktree.mjs` — harden `baseRef` in `add()` (reject leading-dash / insert `--`)
- `tests/lib/worktree.test.mjs` — baseRef hardening test
- `skills/implement/SKILL.md` — `--parallel` orchestration prose (keep the existing anti-`isolation:"worktree"` guardrail)

**Reference (read, do not modify):**
- `lib/worktree.mjs` — primitive API the orchestration calls (add/list/merge/remove/guard)
- `.context-index/specs/features/worktree-parallelization/worktree-primitive.spec.md` — the dependency contract
- `lib/build-state.mjs` — pattern for `lib/cli/*.mjs` run/help contract + WorktreeError-style codes

---

## Context Packets

### Task 1 Context (groups)
- Spec: parallel-implement.spec.md (Behaviors: parse section, merge order; serial fallback on malformed)
- `skills/plan/SKILL.md` (the `## Parallelization` grammar this parses)
- Charter capability: parallel-implement

### Task 2 Context (baseline)
- Spec: Behaviors §4.1 (ORCHESTRATOR_POLLUTED); Preconditions (baseline record)
- `lib/worktree.mjs` (git invocation pattern via execFileSync)

### Task 3 Context (verify)
- Spec: Behaviors §4.2 (COMMITS_NOT_VERIFIED, per-task completeness); plan-task/board `done` state
- `lib/lifecycle-state.mjs` (planTasks projection — how "done" is read)

### Task 4 Context (config)
- Spec: Preconditions (max_parallel floor 1); RERUN_COLLISION behavior
- `lib/issues/json-adapter.mjs` (the `cas_lock_stale_seconds` floor pattern to mirror)

### Task 5 Context (CLI verb)
- Depends on Tasks 1–4 outputs
- `lib/cli/build-state.mjs` (run({projectRoot,argv})/help() contract, parseArgs, exit codes)

### Task 6 Context (SKILL.md prose)
- Depends on Task 5 (verb the prose calls)
- `skills/implement/SKILL.md:409` (existing anti-isolation guardrail to preserve)
- Spec: the full Behaviors list (dispatch, join, verify, merge, fallback)

### Task 7 Context (baseRef hardening)
- worktree-primitive.spec.md Coverage Gap SEC-1
- `lib/worktree.mjs:add()`

### Task 8 Context (gitignore)
- Spec AC "`.adev/worktrees/` is git-ignored"; charter Invariant (reserved/ignored path)
- `cli/index.mjs` managed-gitignore dispatcher (existing pattern)

---

## Parallelization

- Group A (independent): Task 1 — `lib/parallel/groups.mjs` (+test)
- Group B (independent): Task 2 — `lib/parallel/baseline.mjs` (+test)
- Group C (independent): Task 3 — `lib/parallel/verify.mjs` (+test)
- Group D (independent): Task 4 — `lib/parallel/config.mjs` (+test)
- Group E (independent): Task 7 — `lib/worktree.mjs` baseRef hardening (+test)
- Group F (independent): Task 8 — `lib/parallel/gitignore.mjs` (+test)
- Group G (sequential): Task 5 → Task 6 — CLI verb (registers in cli/index.mjs), then SKILL.md prose

Groups A–F are file-disjoint and run concurrently. Group G runs after A–D land (Task 5 integrates them; Task 6 wires the skill). Task 5 touches `cli/index.mjs`; no A–F task touches it, so E's `lib/worktree.mjs` edit and F's new file do not collide with G. **This plan is itself a valid `--parallel` dogfood target: 6 independent groups.**

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | parseParallelizationSection + computeMergeOrder | medium | unit | — | 2 create |
| 2 | recordBaseline + assertOrchestratorClean | medium | unit | — | 2 create |
| 3 | verifyGroupComplete (per-task) | medium | unit | — | 2 create |
| 4 | clampMaxParallel + detectRerunCollision | small | unit | — | 2 create |
| 5 | `adev parallel` CLI verb | medium | unit | 1,2,3,4 | 2 create, 1 modify |
| 6 | `skills/implement/SKILL.md` --parallel prose | medium | unit | 5 | 1 modify |
| 7 | baseRef hardening in worktree primitive | small | unit | — | 2 modify |
| 8 | `.adev/worktrees/` managed git-ignore block | small | unit | — | 2 create |

---

## Task Structure

### Task 1: parseParallelizationSection + computeMergeOrder [specialist: none]
**Charter capability:** parallel-implement
**Strategy:** unit (fallback)
**Files:** Create `lib/parallel/groups.mjs`, `tests/lib/parallel/groups.test.mjs`
**Tests:** `tests/lib/parallel/groups.test.mjs`

- [ ] **Write failing test** — parse a `## Parallelization` block into `{ groups: [{id, members, independent}] }`; independent-vs-sequential markers; malformed/absent section → `{ groups: [], malformed: true|false }`; `computeMergeOrder(groups, deps)` returns dependency-then-lexicographic order.
- [ ] **Verify test fails** — `node --test tests/lib/parallel/groups.test.mjs`
- [ ] **Implement** — pure parser (Node built-ins only); tolerant of the free-form grammar in `skills/plan/SKILL.md`; returns `malformed: true` (not throw) so the caller can serial-fallback.
- [ ] **Verify test passes**
- [ ] **Commit** — `feat(worktree): parse Parallelization groups + merge order` (branch `feat/worktree/parallel-implement`)

### Task 2: recordBaseline + assertOrchestratorClean [specialist: none]
**Charter capability:** merge-back-semantics
**Strategy:** unit
**Files:** Create `lib/parallel/baseline.mjs`, `tests/lib/parallel/baseline.test.mjs`
**Tests:** `tests/lib/parallel/baseline.test.mjs`

- [ ] **Write failing test** (temp git repo) — `recordBaseline(cwd)` → `{ branch, head, clean }`; `assertOrchestratorClean(cwd, baseline)` returns ok when HEAD==baseline && tree clean, throws `WorktreeError`/`ORCHESTRATOR_POLLUTED` when HEAD moved or tree dirty.
- [ ] **Verify test fails**
- [ ] **Implement** — execFileSync git (rev-parse HEAD, symbolic-ref, status --porcelain).
- [ ] **Verify test passes**
- [ ] **Commit** — `feat(worktree): orchestrator baseline record + pollution assertion`

### Task 3: verifyGroupComplete [specialist: none]
**Charter capability:** parallel-implement
**Strategy:** unit
**Files:** Create `lib/parallel/verify.mjs`, `tests/lib/parallel/verify.test.mjs`
**Tests:** `tests/lib/parallel/verify.test.mjs`

- [ ] **Write failing test** — `verifyGroupComplete({ branch, tasks, cwd })`: passes when every group task is `done` (via `planTasks` projection) AND the branch head advanced; throws `COMMITS_NOT_VERIFIED` when any task is missing (partial commit) even if head advanced.
- [ ] **Verify test fails**
- [ ] **Implement** — read `currentState(...).planTasks` for done-state; check branch head vs base.
- [ ] **Verify test passes**
- [ ] **Commit** — `feat(worktree): per-task completeness verification for parallel groups`

### Task 4: clampMaxParallel + detectRerunCollision [specialist: none]
**Charter capability:** parallel-implement
**Strategy:** unit
**Files:** Create `lib/parallel/config.mjs`, `tests/lib/parallel/config.test.mjs`
**Tests:** `tests/lib/parallel/config.test.mjs`

- [ ] **Write failing test** — `clampMaxParallel(manifest)` returns `max(1, manifest.implement?.max_parallel ?? 4)` (0/negative/NaN → 1); `detectRerunCollision(slug, cwd)` returns true when a retained worktree exists for the slug (via `worktree.list`).
- [ ] **Verify test fails**
- [ ] **Implement** — pure + a `worktree.list` call.
- [ ] **Verify test passes**
- [ ] **Commit** — `feat(worktree): max_parallel clamp + rerun-collision detection`

### Task 5: `adev parallel` CLI verb [specialist: none]
**Charter capability:** parallel-implement
**Strategy:** unit
**Depends on:** Task 1, Task 2, Task 3, Task 4
**Files:** Create `lib/cli/parallel.mjs`, `tests/cli/parallel.test.mjs`; Modify `cli/index.mjs`
**Tests:** `tests/cli/parallel.test.mjs`

- [ ] **Write failing test** — `adev parallel groups --plan <p>` emits JSON groups; `baseline`, `verify`, `config` subcommands emit JSON; exit 0 success / 1 error; unknown subcommand → 1.
- [ ] **Verify test fails**
- [ ] **Implement** — `run({projectRoot,argv})`/`help()` wiring the Task 1–4 helpers; register `["parallel", () => import("../lib/cli/parallel.mjs")]` in `cli/index.mjs`.
- [ ] **Verify test passes**
- [ ] **Commit** — `feat(worktree): adev parallel CLI verb`

### Task 6: `--parallel` orchestration prose in SKILL.md [specialist: none]
**Charter capability:** parallel-implement, serial-fallback
**Strategy:** unit
**Depends on:** Task 5
**Files:** Modify `skills/implement/SKILL.md`
**Tests:** `tests/skills/implement-parallel.test.mjs` (assert the prose documents the flow + error codes + keeps the anti-isolation guardrail)

- [ ] **Write failing test** — a doc-contract test asserting SKILL.md documents: `--parallel` reads groups via `adev parallel`, dispatches bare directed subagents (never `isolation:"worktree"`), the absolute-path/`-C` prompt contract, join + `ORCHESTRATOR_POLLUTED`/`COMMITS_NOT_VERIFIED`, deterministic merge, per-group immediate removal, `RERUN_COLLISION`/`--fresh`, and all serial-fallback reasons.
- [ ] **Verify test fails**
- [ ] **Implement** — add the `--parallel` mode section; preserve the existing anti-`isolation:"worktree"` guardrail verbatim.
- [ ] **Verify test passes**
- [ ] **Commit** — `feat(worktree): /adev:implement --parallel orchestration prose`

### Task 7: baseRef hardening (primitive SEC-1) [specialist: none]
**Charter capability:** worktree-primitive
**Strategy:** unit
**Files:** Modify `lib/worktree.mjs`, `tests/lib/worktree.test.mjs`
**Tests:** `tests/lib/worktree.test.mjs`

- [ ] **Write failing test** — `add({ slug, baseRef: "--foo" })` rejects the dash-prefixed ref (or the git argv includes a `--` separator so it cannot be parsed as an option).
- [ ] **Verify test fails**
- [ ] **Implement** — reject a leading-dash `baseRef` with `INVALID_SLUG`-style guard OR insert `--` before positionals in the `worktree add` argv.
- [ ] **Verify test passes**
- [ ] **Commit** — `fix(worktree): harden baseRef against git argument injection`

### Task 8: `.adev/worktrees/` managed git-ignore block [specialist: none]
**Charter capability:** merge-back-semantics
**Strategy:** unit
**Files:** Create `lib/parallel/gitignore.mjs`, `tests/lib/parallel/gitignore.test.mjs`
**Tests:** `tests/lib/parallel/gitignore.test.mjs`

- [ ] **Write failing test** — `ensureWorktreeIgnore(mainRoot)` adds a managed `.adev/worktrees/` block to `.gitignore` (idempotent; does not duplicate; preserves existing content).
- [ ] **Verify test fails**
- [ ] **Implement** — managed-block insert mirroring `cli/index.mjs` managed-gitignore dispatcher.
- [ ] **Verify test passes**
- [ ] **Commit** — `feat(worktree): managed .adev/worktrees git-ignore block`

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full suite. Recorded in `.validate.md`.

- Tests pass: `npm test`
- All new `lib/parallel/*` + CLI + worktree tests green; full suite stays green (currently 4289+).
- All acceptance criteria from `parallel-implement.spec.md` satisfied (esp. the 4 rev-2 warnings: completeness verification, orchestrator-pollution assertion, re-run collision, eval-as-gate).
- No constitutional violations (zero-dep, ESM, skills-are-markdown, no inline-Node in SKILL.md).
- The equivalence eval (`equivalence-eval.spec.md`, to be authored) is the load-bearing correctness gate for "parallel ≡ serial" and gates final acceptance.
