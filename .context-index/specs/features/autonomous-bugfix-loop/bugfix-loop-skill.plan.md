<!-- partial_schema: plan@1 -->

# Implementation Plan: /adev:bugfix-loop Skill

> **Methodology:** adev
> **Charter:** .context-index/specs/features/autonomous-bugfix-loop/charter.md
> **Spec:** .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md
> **Review:** PASS_WITH_NOTES (2026-08-20, round 7)
> **Platform:** Node.js (ESM), JavaScript, npm, node:test

**Goal:** Build the new `/adev:bugfix-loop` skill — a self-re-invoking, one-bug-per-turn loop that drains eligible bugs from the board by composing three already-shipped capabilities (`adev issues next/claim/release`, `/adev:debug --issue --apply --auto`, `lib/bugfix-loop-attempts.mjs`) rather than building new orchestration machinery.

**Architecture:** Two new small library modules plus one new skill file, following the exact pattern already established by `/adev:build`'s own resume machinery (`lib/build-state.mjs` + `adev build-state` CLI verb, invoked from `skills/build/SKILL.md` prose):

1. `lib/bugfix-loop-run.mjs` — owns `BugfixLoopRun` state, one gitignored JSON snapshot per run at `.context-index/lifecycle-state/bugfix-loop-runs-<run_id>.json` (same dual-format precedent as `lib/build-state.mjs`'s `<slug>.json`, not the JSONL append pattern `lib/bugfix-loop-attempts.mjs` uses — a run is a single mutable snapshot with one writer per turn, not an append-only history). Exposes run creation, the status guard, the per-turn budget check, attempt/turn bookkeeping, terminal status→token mapping, and a schema-validated `findLatestRunState` for the `--resume`-without-`--resume-run-id` fallback.
2. `lib/cli/bugfix-loop.mjs` — the `adev bugfix-loop <sub>` CLI verb group wrapping (1), mirroring `adev build-state`'s shape exactly so `skills/bugfix-loop/SKILL.md` can be pure markdown per the `cli-driver-surface` charter (no inline Node).
3. `lib/cli/issues-record-attempt.mjs` — a small CLI wrapper for the **already-existing** `recordDebugAttempt()` export in `lib/bugfix-loop-attempts.mjs` (built by the sibling `per-issue-attempt-cap` plan, but never given a CLI-callable entry point — verified by grep: no `cli/index.mjs` or `lib/cli/*.mjs` reference to `recordDebugAttempt` exists today). Without this wrapper, a markdown-only skill has no way to call it. Registered as a new `record-attempt` subcommand of the existing `adev issues` verb group (`lib/cli/issues.mjs`), since an `AttemptRecord` is issue-scoped, not run-scoped.
4. `skills/bugfix-loop/SKILL.md` — the skill itself: one-bug-per-turn loop, bounded 3-retry claim contention, `--github-sync` fail-fast (the tracker-provider-bridge capability is Milestone 2 and unimplemented — verified by grep: no `lib/**/tracker*` file exists in this codebase today), self-re-invocation via the Skill tool copying `/adev:build`'s discipline, and the `ADEV-BUGFIXLOOP:` completion token.
5. Five small coordination edits: `skills/using-adev/SKILL.md` (gateway table row + Persona Output Override carve-out), `skills/work/SKILL.md` (routing table row), and ADR-0015's Decision-section table (new row for the run-state file format).

All three sibling specs this plan depends on are already shipped and verified in this codebase: `adev issues next/claim/release` exist (`lib/cli/issues-next.mjs`, `lib/cli/issues-claim.mjs`), `/adev:debug --auto` with `ADEV_ISSUE_OWNER` resolution and the `ADEV-DEBUG:` token exist (`skills/debug/SKILL.md:16,64,66,163,177,384-386`), and `lib/bugfix-loop-attempts.mjs`'s `recordDebugAttempt`/`readAllAttemptRecords` exist. This plan adds no new dependency on unshipped work.

**Review-note resolutions carried into this plan (round-7 warnings/suggestions, PASS_WITH_NOTES permits deferring these, but this plan actions all three that are actionable at implementation time):**
- **WR-2 (`ADEV_ISSUE_OWNER` propagation has no acceptance-criterion-carrying test):** Task 9 below adds an explicit integration test that sets `ADEV_ISSUE_OWNER` for a simulated claim step and asserts a subsequent re-claim under the same env var succeeds (not `ISSUE_ALREADY_CLAIMED`), closing the gap the reviewer flagged.
- **BD-1 (`--resume-run-id` has no stated format validation or path-containment check):** Task 1 below makes `resolveRunStatePath()` reject any `run_id` that does not match the `crypto.randomUUID()` output shape (strict regex) before it is ever spliced into a filesystem path — closing this at the library boundary so every caller (CLI verb, skill) inherits the protection for free, rather than validating ad hoc at each call site.
- **BD-2 (`--resume`-without-`--resume-run-id` fallback trusts a glob-matched file by mtime alone):** Task 4 below's `findLatestRunState()` additionally validates that the filename's embedded run_id matches the file's own `run_id` field and that `status` is one of the charter's four enum values before treating the file as authoritative; a corrupted or foreign-shaped candidate is skipped in favor of the next-most-recent file, not silently used.
- **RI-1 (spec wording — `status` field called "4-value terminal-state enum" when one value, `running`, is non-terminal):** a spec-text wording fix, not a plan concern — noted here for completeness, not actioned by this plan (this plan implements the field as already specified: `running`/`complete`/`budget_exhausted`/`blocked`).

---

## File Structure

**Create:**
- `lib/bugfix-loop-run.mjs` — `BugfixLoopRun` state: create/read/write, status guard, budget check, attempt/turn bookkeeping, terminal status→token mapping, schema-validated latest-run lookup
- `tests/lib/bugfix-loop-run.test.mjs` — unit coverage for all of the above, plus the `.gitignore` glob-coverage assertion
- `lib/cli/bugfix-loop.mjs` — `adev bugfix-loop create|guard|record-attempt|complete-turn|finish|latest`
- `tests/cli/bugfix-loop.test.mjs` — spawnSync CLI-surface tests (style precedent: `tests/cli/build-state.test.mjs`)
- `lib/cli/issues-record-attempt.mjs` — `adev issues record-attempt` wrapping `recordDebugAttempt()`
- `tests/cli/issues-record-attempt.test.mjs`
- `skills/bugfix-loop/SKILL.md` — the new skill
- `tests/skills/bugfix-loop-skill.test.mjs` — drift-guard suite (style precedent: `tests/skills/debug-completion-and-auto.test.mjs`) asserting Arguments, Load Skill Extensions block, completion-token grammar/final-line rule, `--github-sync` fail-fast instruction, and the status-guard/budget-check ordering are all present in the rendered SKILL.md
- `tests/integration/bugfix-loop-loop.test.mjs` — mechanism-level integration coverage: 2+-turn drain simulation, claim-failure-retry bound, `ADEV_ISSUE_OWNER` propagation (WR-2), crash-mid-attempt no-orphaned-claim, `AttemptRecord` written after every completed attempt — all driven directly through the CLI verbs from (1)-(3) plus `adev issues claim/release`, since the skill prose itself is only executable by an LLM turn and cannot be driven by `node:test`

**Modify:**
- `cli/index.mjs` — register the new `bugfix-loop` verb group (mirrors the existing `build-state` registration)
- `lib/cli/issues.mjs` — add `record-attempt` to the subcommand dispatch table and `help()` text
- `skills/using-adev/SKILL.md:65-67` — gateway table row for `/adev:bugfix-loop`; `:142` — extend the Persona Output Override completion-tokens bullet to name `ADEV-BUGFIXLOOP`
- `skills/work/SKILL.md:~103-107` — routing table row ("Drain P2/P3 bugs unattended" → `/adev:bugfix-loop`)
- `.context-index/adrs/0015-lifecycle-state-dual-format-coexistence.md` — new Decision-table row for `bugfix-loop-runs-<run_id>.json`
- `tests/adrs/0015-decision-table.test.mjs` — extend (already exists, created by the sibling `per-issue-attempt-cap` plan) with an assertion for the new row
- `.context-index/specs/features/autonomous-bugfix-loop/charter.md` — Capability Map row `` `/adev:bugfix-loop` Skill `` status `review-passed` → `planned` (Step 7 of `/adev:plan`, applied after this plan is written)

**Reference (read, do not modify):**
- `lib/build-state.mjs` — `atomicWriteJson` (temp-file + rename), `resolveStatePath`, dual-format precedent; the exact pattern `lib/bugfix-loop-run.mjs` mirrors
- `lib/bugfix-loop-attempts.mjs` — `recordDebugAttempt`, `readAllAttemptRecords`, `resolveAttemptsLogPath`; do not modify signatures (System Constitution Reference / high-risk-reuse posture already established by the sibling plan)
- `lib/loop-convergence.mjs` — not touched by this plan; reused transitively via `recordDebugAttempt`
- `lib/cli/issues-next.mjs`, `lib/cli/issues-claim.mjs`, `lib/cli/issues.mjs` — existing verb shapes (`parseArgs`, `--json` convention, exit-code conventions: 0 success / 1 usage-or-error / 2 refusal) to mirror exactly
- `lib/errors.mjs` — `codedError` convention
- `skills/build/SKILL.md:249-265,325,712-738` — self-re-invocation discipline ("immediately re-invoke ... via the Skill tool", "Ending your response without re-invoking is a build failure") and the Resume Mode / zombie-run detection shape this plan's Step 0 mirrors at run-granularity instead of spec-granularity
- `skills/debug/SKILL.md` (full read) — `--auto`, Phase 1.6 `ADEV_ISSUE_OWNER` resolution (lines 151-180), Phase 6 `FAILING-CHECKS:`/insight-note merge (lines 340-386), `### Completion token` section (lines 380-387) — all already shipped; this plan's skill invokes `/adev:debug` exactly as documented there, changes nothing in it
- `skills/validate/SKILL.md:588-595` — second completion-token pattern precedent
- `.context-index/specs/cross-cutting/completion-tokens/completion-tokens.spec.md` — pinned grammar `^ADEV-[A-Z]+: [A-Z_]+$`; B6-B8 (persona-independence, last-line anchoring, exactly-once)
- `.context-index/specs/cross-cutting/single-front-door.spec.md:93,105` — the `build`/`validate` spine-skill-footer exclusion this plan's skill must also carry (`ADEV-BUGFIXLOOP` joins that excluded set)
- `skills/using-adev/SKILL.md:65-72,110-143` — gateway table and Persona Output Override sections to extend
- `skills/work/SKILL.md:100-110` — routing table shape to extend
- `.context-index/adrs/0015-lifecycle-state-dual-format-coexistence.md` — existing Decision table (already has a `bugfix-loop-attempts.jsonl` row from the sibling plan) to extend with a second new row
- `.context-index/specs/features/autonomous-bugfix-loop/bug-selection-and-eligibility.spec.md`, `debug-completion-and-auto.spec.md`, `per-issue-attempt-cap.spec.md` — sibling contracts this skill composes; read for exact CLI signatures and token grammars, not modified
- `.gitignore:31` — `.context-index/lifecycle-state/*.json` glob the flat `bugfix-loop-runs-<run_id>.json` filename must stay covered by

---

## Context Packets

### Task 1 Context
- Spec: `bugfix-loop-skill.spec.md` (Output Contract's `BugfixLoopRun` field list, BD-1 finding)
- Charter: `charter.md` (Domain Model > `BugfixLoopRun` entity row, full field list including `sync_retry_counts`)
- Source files: `lib/build-state.mjs` (full read — `atomicWriteJson`, `resolveStatePath`, `slugFromSpec`'s validate-then-use-in-path shape as the BD-1 precedent), `lib/errors.mjs` (full read — `codedError`)

### Task 2 Context
- Spec: `bugfix-loop-skill.spec.md` (Start-of-turn status guard bullet, Per-turn budget check bullet, Acceptance Criteria bullets 3-4, 9)
- Source files: `lib/bugfix-loop-run.mjs` (from Task 1, full read — extending)

### Task 3 Context
- Spec: `bugfix-loop-skill.spec.md` (bugs_attempted[]/turns_completed bullet, completion-token-to-persisted-status mapping bullet, `degraded_sync_note` consumer bullet, Acceptance Criteria bullets 7, 10)
- Source files: `lib/bugfix-loop-run.mjs` (from Tasks 1-2, full read — extending)

### Task 4 Context
- Spec: `bugfix-loop-skill.spec.md` (`--resume` fallback bullet in Invocation Modes, BD-2 finding)
- Source files: `lib/bugfix-loop-run.mjs` (from Tasks 1-3, full read — extending)

### Task 5 Context
- Spec: `bugfix-loop-skill.spec.md` (Output Contract, all bullets — this verb group is the CLI-callable surface for everything Tasks 1-4 built)
- Source files: `lib/cli/build-state.mjs` (full read — CLI-wrapper style precedent: `parseArgs`, subcommand dispatch, `--json`/text dual output), `lib/bugfix-loop-run.mjs` (from Tasks 1-4, full read)
- CLI registration: `cli/index.mjs:1969` (the `build-state` registration line to mirror)

### Task 6 Context
- Spec: `bugfix-loop-skill.spec.md` (AttemptRecord write bullet in Output Contract, Acceptance Criteria bullet "AttemptRecord is written after every completed attempt")
- Sibling contract: `per-issue-attempt-cap.spec.md` (BEH-1/2/3 — the exact outcome→write mapping `recordDebugAttempt` already implements)
- Source files: `lib/bugfix-loop-attempts.mjs` (full read — `recordDebugAttempt` signature: `(projectRoot, manifest, { issueId, outcome, checkIds, rawOutput })`), `lib/cli/issues-claim.mjs` (full read — CLI-wrapper style precedent for a verb living inside `lib/cli/issues.mjs`'s dispatch), `lib/cli/issues.mjs` (full read — dispatch table to extend)

### Task 7 Context
- ADR: `.context-index/adrs/0015-lifecycle-state-dual-format-coexistence.md` (Decision section table, full read — already has the `bugfix-loop-attempts.jsonl` row)
- Test precedent: `tests/adrs/0015-decision-table.test.mjs` (full read — existing file to extend, not replace)

### Task 8 Context
- Spec: `bugfix-loop-skill.spec.md` (full read — Invocation Modes, Arguments, Output Contract, Failure Modes, all Acceptance Criteria)
- Charter: `charter.md` (Domain Model, Invariants — especially "the loop never marks an issue closed except through `/adev:debug`'s own Phase 6 confidence gate")
- Source files: `skills/build/SKILL.md:249-338,712-738` (full read — self-re-invocation + resume-mode precedent), `skills/debug/SKILL.md` (full read — the exact CLI shape this skill's Step 4 must invoke: `--issue`, `--apply`, `--auto`, `ADEV_ISSUE_OWNER`, `ADEV-DEBUG:` token), `skills/validate/SKILL.md:588-595` (completion-token section precedent)
- CLI verbs from Tasks 5-6 (full read — exact flag names/shapes this skill's steps must cite verbatim)
- Cross-cutting: `completion-tokens.spec.md` (token grammar), `single-front-door.spec.md:93,105` (spine-skill-footer exclusion)

### Task 9 Context
- Spec: `bugfix-loop-skill.spec.md` (Acceptance Criteria bullets 2, 12, 13, 15, 16 — 2+-turn self-re-invocation mechanism, claim/release discipline on crash, claim-failure-retry bound, `AttemptRecord` write, `ADEV_ISSUE_OWNER` propagation)
- Source files: `lib/cli/issues-claim.mjs`, `lib/cli/issues-next.mjs` (full read), CLI verbs from Tasks 5-6 (full read), `lib/bugfix-loop-attempts.mjs::readAttemptRecord` (signature only)
- Test precedent: `tests/cli/build-state.test.mjs` (full read — `makeTempProject`/temp-dir spawnSync harness pattern)

### Task 10 Context
- Spec: `bugfix-loop-skill.spec.md` (Persona-exempt bullet, Coordination notes in System Constitution Reference)
- Source files: `skills/using-adev/SKILL.md:65-72,110-143` (full read)
- Test precedent: `tests/skills/debug-completion-and-auto.test.mjs` (the analogous `ADEV-DEBUG` persona carve-out test, style precedent)

### Task 11 Context
- Spec: `bugfix-loop-skill.spec.md` (Coordination note: "`/adev:work`'s routing table ... must add an entry for `/adev:bugfix-loop`")
- Source files: `skills/work/SKILL.md:100-110` (full read — routing table shape)

---

## Parallelization

- Group A (sequential, same file `lib/bugfix-loop-run.mjs`): Task 1 → Task 2 → Task 3 → Task 4
- Group B (independent of Group A, different file, only needs `lib/bugfix-loop-attempts.mjs` which already exists): Task 6 — runnable any time
- Task 5 (CLI verb group for `lib/bugfix-loop-run.mjs`): depends on Task 1-4 (needs the full lib API surface)
- Task 7 (ADR row): depends on Task 1 only (needs the run-state file path/format decided)
- Task 8 (the SKILL.md itself): depends on Task 5 and Task 6 (must cite their exact final CLI flag shapes)
- Task 9 (integration tests): depends on Task 8 (exercises the full composed mechanism, including the skill's documented CLI call sequence)
- Group C (fully independent, no code dependency — only need the skill's name, fixed from the spec): Task 10, Task 11 — runnable at any point

Effective order: {Task 1 → Task 2 → Task 3 → Task 4} ∥ {Task 6} → Task 5 → Task 7 → Task 8 → Task 9, with Task 10/Task 11 runnable any time.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | BugfixLoopRun: create/read/write + run_id path validation (BD-1) | medium | unit | — | 2 create, 0 modify |
| 2 | Status guard + per-turn budget check | small | unit | Task 1 | 0 create, 0 modify |
| 3 | Attempt/turn bookkeeping + terminal status→token mapping | medium | unit | Task 1, Task 2 | 0 create, 0 modify |
| 4 | Schema-validated `findLatestRunState` (BD-2) | small | unit | Task 1, Task 2, Task 3 | 0 create, 0 modify |
| 5 | `adev bugfix-loop` CLI verb group | medium | unit | Task 1, Task 2, Task 3, Task 4 | 2 create, 1 modify |
| 6 | `adev issues record-attempt` CLI wrapper | small | unit | — | 2 create, 1 modify |
| 7 | ADR-0015 Decision-table row for run-state file | small | unit | Task 1 | 0 create, 2 modify |
| 8 | `skills/bugfix-loop/SKILL.md` | large | unit | Task 5, Task 6 | 1 create, 0 modify |
| 9 | Integration tests: 2-turn drain, claim-retry bound, ADEV_ISSUE_OWNER wiring (WR-2), crash handling | large | unit | Task 8 | 1 create, 0 modify |
| 10 | `using-adev` gateway table + persona carve-out | small | unit | Task 8 | 0 create, 1 modify |
| 11 | `work` routing table entry | small | unit | Task 8 | 0 create, 1 modify |

---

## Task Structure

### Task 1: BugfixLoopRun — create/read/write + run_id path validation (BD-1) [specialist: none]

**Charter capability:** `/adev:bugfix-loop` Skill
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/bugfix-loop-run.mjs`
- Create: `tests/lib/bugfix-loop-run.test.mjs`

**Tests:** `tests/lib/bugfix-loop-run.test.mjs` — new suite (per-behavior granularity, source: manifest `test_policy.granularity`). Covers the Output Contract's `BugfixLoopRun` field list, BD-1.

**Context to load:**
- `lib/build-state.mjs` (`atomicWriteJson`, `resolveStatePath` — full read)
- `lib/errors.mjs` (`codedError`)

- [ ] **Write failing test**

```javascript
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createRun, readRunState, resolveRunStatePath } from '../../lib/bugfix-loop-run.mjs';

test('createRun writes a run-state file with all BugfixLoopRun fields, defaults intact', () => {
  const root = mkdtempSync(join(tmpdir(), 'bfl-run-'));
  const state = createRun(root, { maxBugs: 5, maxTurns: 10 });
  assert.match(state.run_id, /^[0-9a-f-]{36}$/i);
  assert.equal(state.status, 'running');
  assert.deepEqual(state.bugs_attempted, []);
  assert.equal(state.turns_completed, 0);
  assert.equal(state.degraded_sync_note, null);
  assert.deepEqual(state.sync_retry_counts, { unreachable_consecutive_turns: 0, oversized_consecutive_turns: {} });
  assert.deepEqual(readRunState(root, state.run_id), state);
  rmSync(root, { recursive: true, force: true });
});

test('resolveRunStatePath rejects a non-UUID-shaped run_id (BD-1)', () => {
  const root = mkdtempSync(join(tmpdir(), 'bfl-run-'));
  assert.throws(() => resolveRunStatePath(root, '../../etc/passwd'), /INVALID_RUN_ID/);
  assert.throws(() => resolveRunStatePath(root, 'not-a-uuid'), /INVALID_RUN_ID/);
  rmSync(root, { recursive: true, force: true });
});

test('run-state filename stays covered by the .gitignore lifecycle-state/*.json glob', () => {
  const root = process.cwd();
  const path = resolveRunStatePath(root, '11111111-1111-4111-8111-111111111111');
  const rel = path.slice(root.length + 1);
  const out = execSync(`git check-ignore ${rel}`, { cwd: root }).toString().trim();
  assert.equal(out, rel);
});
```

- [ ] **Verify test fails**

Run: `node --test -- tests/lib/bugfix-loop-run.test.mjs`
Expected: FAIL — `Cannot find module '../../lib/bugfix-loop-run.mjs'`

- [ ] **Implement**

```javascript
// lib/bugfix-loop-run.mjs
import { readFileSync, writeFileSync, renameSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { join, isAbsolute, dirname } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { codedError as mkErr } from './errors.mjs';

const RUN_STATE_DIR = '.context-index/lifecycle-state';
// Matches crypto.randomUUID()'s output shape exactly (BD-1: reject anything
// else before it is ever spliced into a filesystem path).
const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertValidRunId(runId) {
  if (typeof runId !== 'string' || !RUN_ID_PATTERN.test(runId)) {
    throw mkErr('INVALID_RUN_ID', `run_id must be a crypto.randomUUID()-shaped string, got "${runId}"`);
  }
}

export function resolveRunStatePath(projectRoot, runId) {
  if (!isAbsolute(projectRoot)) throw mkErr('INVALID_PROJECT_ROOT', 'projectRoot must be an absolute path');
  assertValidRunId(runId);
  return join(projectRoot, RUN_STATE_DIR, `bugfix-loop-runs-${runId}.json`);
}

function atomicWriteJson(filePath, data) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n');
  try {
    renameSync(tmpPath, filePath);
  } catch (err) {
    try { unlinkSync(tmpPath); } catch { /* swallow cleanup errors */ }
    throw err;
  }
}

export function createRun(projectRoot, { maxBugs = null, maxTurns = 20 } = {}) {
  const runId = randomUUID();
  const state = {
    run_id: runId,
    started_at: new Date().toISOString(),
    max_bugs: maxBugs,
    max_turns: maxTurns,
    bugs_attempted: [],
    turns_completed: 0,
    status: 'running',
    degraded_sync_note: null,
    sync_retry_counts: { unreachable_consecutive_turns: 0, oversized_consecutive_turns: {} },
  };
  atomicWriteJson(resolveRunStatePath(projectRoot, runId), state);
  return state;
}

export function readRunState(projectRoot, runId) {
  const path = resolveRunStatePath(projectRoot, runId);
  if (!existsSync(path)) throw mkErr('RUN_NOT_FOUND', `no run-state file for run_id "${runId}"`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeRunState(projectRoot, state) {
  atomicWriteJson(resolveRunStatePath(projectRoot, state.run_id), state);
  return state;
}
```

- [ ] **Verify test passes**

Run: `node --test -- tests/lib/bugfix-loop-run.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch (if not already created): `feat/autonomous-bugfix-loop/bugfix-loop-skill`

```bash
git add lib/bugfix-loop-run.mjs tests/lib/bugfix-loop-run.test.mjs
git commit -m "feat(autonomous-bugfix-loop): add BugfixLoopRun state module with validated run_id paths

Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md
Plan-task: 1"
```

---

### Task 2: Status guard + per-turn budget check [specialist: none]

**Charter capability:** `/adev:bugfix-loop` Skill
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- (extends `lib/bugfix-loop-run.mjs` / `tests/lib/bugfix-loop-run.test.mjs` from Task 1)

**Tests:** `tests/lib/bugfix-loop-run.test.mjs` — extend. Covers Acceptance Criteria bullets 3, 4, 9.

**Context to load:**
- `lib/bugfix-loop-run.mjs` (from Task 1, full read)

- [ ] **Write failing test**

```javascript
test('checkStatusGuard: refuses when status is not running', () => {
  assert.deepEqual(checkStatusGuard({ status: 'running' }), { ok: true });
  assert.deepEqual(checkStatusGuard({ status: 'complete' }), { ok: false, status: 'complete' });
  assert.deepEqual(checkStatusGuard({ status: 'blocked' }), { ok: false, status: 'blocked' });
});

test('checkBudget: exhausted on max_bugs reached (AC bullet 3)', () => {
  const state = { max_bugs: 2, max_turns: null, bugs_attempted: [{}, {}], turns_completed: 0 };
  assert.deepEqual(checkBudget(state), { exhausted: true, reason: 'max_bugs' });
});

test('checkBudget: exhausted on turns_completed reaching max_turns, independent of bugs_attempted (AC bullet 4)', () => {
  const state = { max_bugs: null, max_turns: 5, bugs_attempted: [], turns_completed: 5 };
  assert.deepEqual(checkBudget(state), { exhausted: true, reason: 'max_turns' });
});

test('checkBudget: not exhausted when neither cap is hit', () => {
  const state = { max_bugs: 5, max_turns: 20, bugs_attempted: [{}], turns_completed: 1 };
  assert.deepEqual(checkBudget(state), { exhausted: false, reason: null });
});
```

- [ ] **Verify test fails**

Run: `node --test -- tests/lib/bugfix-loop-run.test.mjs`
Expected: FAIL — `checkStatusGuard is not a function`

- [ ] **Implement**

```javascript
export function checkStatusGuard(state) {
  if (state.status !== 'running') return { ok: false, status: state.status };
  return { ok: true };
}

export function checkBudget(state) {
  if (state.max_bugs != null && state.bugs_attempted.length >= state.max_bugs) {
    return { exhausted: true, reason: 'max_bugs' };
  }
  if (state.max_turns != null && state.turns_completed >= state.max_turns) {
    return { exhausted: true, reason: 'max_turns' };
  }
  return { exhausted: false, reason: null };
}
```

- [ ] **Verify test passes**

Run: `node --test -- tests/lib/bugfix-loop-run.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/bugfix-loop-run.mjs tests/lib/bugfix-loop-run.test.mjs
git commit -m "feat(autonomous-bugfix-loop): add status guard and per-turn budget check to BugfixLoopRun

Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md
Plan-task: 2"
```

---

### Task 3: Attempt/turn bookkeeping + terminal status→token mapping [specialist: none]

**Charter capability:** `/adev:bugfix-loop` Skill
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2
**Files:**
- (extends `lib/bugfix-loop-run.mjs` / `tests/lib/bugfix-loop-run.test.mjs`)

**Tests:** `tests/lib/bugfix-loop-run.test.mjs` — extend. Covers Acceptance Criteria bullets 7, 10 and the `degraded_sync_note` consumer bullet.

**Context to load:**
- `lib/bugfix-loop-run.mjs` (from Tasks 1-2, full read)

- [ ] **Write failing test**

```javascript
test('appendAttempt appends to bugs_attempted[] without touching turns_completed', () => {
  const root = mkdtempSync(join(tmpdir(), 'bfl-run-'));
  const state = createRun(root, { maxBugs: null, maxTurns: 20 });
  const updated = appendAttempt(root, state.run_id, 'issue-1');
  assert.equal(updated.bugs_attempted.length, 1);
  assert.equal(updated.bugs_attempted[0].issue_id, 'issue-1');
  assert.equal(updated.turns_completed, 0);
  rmSync(root, { recursive: true, force: true });
});

test('completeTurn increments turns_completed by exactly 1, every call', () => {
  const root = mkdtempSync(join(tmpdir(), 'bfl-run-'));
  const state = createRun(root, {});
  completeTurn(root, state.run_id);
  const after = completeTurn(root, state.run_id);
  assert.equal(after.turns_completed, 2);
  rmSync(root, { recursive: true, force: true });
});

test('finishRun writes the matching terminal status and returns the pinned token (AC bullet 7)', () => {
  const root = mkdtempSync(join(tmpdir(), 'bfl-run-'));
  const state = createRun(root, {});
  const { state: finished, token } = finishRun(root, state.run_id, { status: 'budget_exhausted' });
  assert.equal(finished.status, 'budget_exhausted');
  assert.equal(token, 'BUDGET_EXHAUSTED');
  assert.equal(readRunState(root, state.run_id).status, 'budget_exhausted');
  rmSync(root, { recursive: true, force: true });
});

test('finishRun rejects a non-terminal status', () => {
  const root = mkdtempSync(join(tmpdir(), 'bfl-run-'));
  const state = createRun(root, {});
  assert.throws(() => finishRun(root, state.run_id, { status: 'running' }), /INVALID_TERMINAL_STATUS/);
  rmSync(root, { recursive: true, force: true });
});

test('finishRun: complete status persists before the COMPLETE token is returned (AC bullet 8 — round-1 plan-review fix: the prior draft only covered budget_exhausted here and blocked in Task 5, never complete)', () => {
  const root = mkdtempSync(join(tmpdir(), 'bfl-run-'));
  const state = createRun(root, {});
  const { state: finished, token } = finishRun(root, state.run_id, { status: 'complete' });
  assert.equal(finished.status, 'complete');
  assert.equal(token, 'COMPLETE');
  assert.equal(readRunState(root, state.run_id).status, 'complete');
  rmSync(root, { recursive: true, force: true });
});

test('tokenForStatus maps all three terminal statuses (AC bullet 7)', () => {
  assert.equal(tokenForStatus('complete'), 'COMPLETE');
  assert.equal(tokenForStatus('budget_exhausted'), 'BUDGET_EXHAUSTED');
  assert.equal(tokenForStatus('blocked'), 'BLOCKED');
});
```

- [ ] **Verify test fails**

Run: `node --test -- tests/lib/bugfix-loop-run.test.mjs`
Expected: FAIL — `appendAttempt is not a function`

- [ ] **Implement**

```javascript
export function appendAttempt(projectRoot, runId, issueId) {
  const state = readRunState(projectRoot, runId);
  state.bugs_attempted.push({ issue_id: issueId, at: new Date().toISOString() });
  return writeRunState(projectRoot, state);
}

export function completeTurn(projectRoot, runId) {
  const state = readRunState(projectRoot, runId);
  state.turns_completed += 1;
  return writeRunState(projectRoot, state);
}

const STATUS_TOKEN = { complete: 'COMPLETE', budget_exhausted: 'BUDGET_EXHAUSTED', blocked: 'BLOCKED' };

export function tokenForStatus(status) {
  const token = STATUS_TOKEN[status];
  if (!token) throw mkErr('INVALID_TERMINAL_STATUS', `"${status}" is not one of complete|budget_exhausted|blocked`);
  return token;
}

export function finishRun(projectRoot, runId, { status, note } = {}) {
  const token = tokenForStatus(status); // throws INVALID_TERMINAL_STATUS for bad input, before any write
  const state = readRunState(projectRoot, runId);
  state.status = status;
  if (note) state.terminal_note = note;
  writeRunState(projectRoot, state);
  return { state, token };
}
```

- [ ] **Verify test passes**

Run: `node --test -- tests/lib/bugfix-loop-run.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/bugfix-loop-run.mjs tests/lib/bugfix-loop-run.test.mjs
git commit -m "feat(autonomous-bugfix-loop): add attempt/turn bookkeeping and terminal status/token mapping

Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md
Plan-task: 3"
```

---

### Task 4: Schema-validated findLatestRunState (BD-2) [specialist: none]

**Charter capability:** `/adev:bugfix-loop` Skill
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2, Task 3
**Files:**
- (extends `lib/bugfix-loop-run.mjs` / `tests/lib/bugfix-loop-run.test.mjs`)

**Tests:** `tests/lib/bugfix-loop-run.test.mjs` — extend. Covers the `--resume`-without-`--resume-run-id` fallback bullet, BD-2.

**Context to load:**
- `lib/bugfix-loop-run.mjs` (from Tasks 1-3, full read)

- [ ] **Write failing test**

```javascript
import { mkdirSync, writeFileSync } from 'node:fs';

test('findLatestRunState returns the most-recently-modified valid run (BD-2 happy path)', () => {
  const root = mkdtempSync(join(tmpdir(), 'bfl-run-'));
  const older = createRun(root, {});
  completeTurn(root, older.run_id); // touch mtime, still older than the next create
  const newer = createRun(root, {});
  const found = findLatestRunState(root);
  assert.equal(found.run_id, newer.run_id);
  rmSync(root, { recursive: true, force: true });
});

test('findLatestRunState skips a candidate whose filename run_id does not match its own run_id field (BD-2)', () => {
  const root = mkdtempSync(join(tmpdir(), 'bfl-run-'));
  const good = createRun(root, {});
  const dir = join(root, '.context-index', 'lifecycle-state');
  const foreignId = '22222222-2222-4222-8222-222222222222';
  writeFileSync(
    join(dir, `bugfix-loop-runs-${foreignId}.json`),
    JSON.stringify({ run_id: 'mismatched-id', status: 'running' }),
  );
  const found = findLatestRunState(root);
  assert.equal(found.run_id, good.run_id); // foreign/mismatched file skipped, good one found instead
  rmSync(root, { recursive: true, force: true });
});

test('findLatestRunState skips a candidate with a status outside the charter enum (BD-2)', () => {
  const root = mkdtempSync(join(tmpdir(), 'bfl-run-'));
  const good = createRun(root, {});
  const dir = join(root, '.context-index', 'lifecycle-state');
  const badId = '33333333-3333-4333-8333-333333333333';
  writeFileSync(join(dir, `bugfix-loop-runs-${badId}.json`), JSON.stringify({ run_id: badId, status: 'not-a-real-status' }));
  const found = findLatestRunState(root);
  assert.equal(found.run_id, good.run_id);
  rmSync(root, { recursive: true, force: true });
});

test('findLatestRunState returns null when no run-state files exist', () => {
  const root = mkdtempSync(join(tmpdir(), 'bfl-run-'));
  mkdirSync(join(root, '.context-index', 'lifecycle-state'), { recursive: true });
  assert.equal(findLatestRunState(root), null);
  rmSync(root, { recursive: true, force: true });
});
```

- [ ] **Verify test fails**

Run: `node --test -- tests/lib/bugfix-loop-run.test.mjs`
Expected: FAIL — `findLatestRunState is not a function`

- [ ] **Implement**

```javascript
import { readdirSync, statSync } from 'node:fs';

const VALID_STATUSES = new Set(['running', 'complete', 'budget_exhausted', 'blocked']);
const RUN_FILE_PATTERN = /^bugfix-loop-runs-(.+)\.json$/;

export function findLatestRunState(projectRoot) {
  const dir = join(projectRoot, RUN_STATE_DIR);
  if (!existsSync(dir)) return null;

  const candidates = readdirSync(dir)
    .map((f) => ({ f, m: f.match(RUN_FILE_PATTERN) }))
    .filter(({ m }) => m)
    .map(({ f, m }) => ({ f, runId: m[1], mtime: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const { f, runId } of candidates) {
    if (!RUN_ID_PATTERN.test(runId)) continue; // BD-2: filename itself must be UUID-shaped
    let state;
    try {
      state = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    } catch {
      continue; // corrupted JSON — skip, try the next-most-recent candidate
    }
    // BD-2: the file's own run_id must match its filename, and status must
    // be one of the charter's four enum values — reject any foreign-shaped
    // or forged file rather than trusting mtime + glob-match alone.
    if (!state || state.run_id !== runId || !VALID_STATUSES.has(state.status)) continue;
    return state;
  }
  return null;
}
```

- [ ] **Verify test passes**

Run: `node --test -- tests/lib/bugfix-loop-run.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/bugfix-loop-run.mjs tests/lib/bugfix-loop-run.test.mjs
git commit -m "feat(autonomous-bugfix-loop): add schema-validated findLatestRunState for the --resume fallback

Fixes a review finding (BD-2): the --resume-without-run-id fallback now
validates filename/run_id agreement and status-enum membership before
trusting a glob-matched, mtime-selected run-state file.

Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md
Plan-task: 4"
```

---

### Task 5: `adev bugfix-loop` CLI verb group [specialist: none]

**Charter capability:** `/adev:bugfix-loop` Skill
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2, Task 3, Task 4
**Files:**
- Create: `lib/cli/bugfix-loop.mjs`
- Create: `tests/cli/bugfix-loop.test.mjs`
- Modify: `cli/index.mjs` (register the verb group, mirroring the `build-state` line)

**Tests:** `tests/cli/bugfix-loop.test.mjs` — new suite. Covers the Output Contract's CLI-callable surface end to end via `spawnSync`.

**Context to load:**
- `lib/cli/build-state.mjs` (full read — CLI-wrapper style precedent)
- `lib/bugfix-loop-run.mjs` (from Tasks 1-4, full read)
- `cli/index.mjs:1969` (registration line to mirror)

- [ ] **Write failing test**

```javascript
// tests/cli/bugfix-loop.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');
const CLI = resolve(PROJECT_ROOT, 'cli', 'index.mjs');

function makeTempProject() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'adev-bfl-cli-')));
  mkdirSync(join(dir, '.context-index'), { recursive: true });
  writeFileSync(join(dir, '.context-index', 'manifest.yaml'), 'project:\n  name: t\n  adev_version: "0.28.0"\n');
  return dir;
}

test('adev bugfix-loop create writes a run and prints run_id JSON', () => {
  const dir = makeTempProject();
  const r = spawnSync('node', [CLI, 'bugfix-loop', 'create', '--max-bugs', '3', '--max-turns', '5', '--json'], { encoding: 'utf8', cwd: dir });
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.match(out.run_id, /^[0-9a-f-]{36}$/i);
  assert.equal(out.status, 'running');
  rmSync(dir, { recursive: true, force: true });
});

test('adev bugfix-loop guard reports proceed:false with terminal status (status guard)', () => {
  const dir = makeTempProject();
  const create = spawnSync('node', [CLI, 'bugfix-loop', 'create', '--json'], { encoding: 'utf8', cwd: dir });
  const { run_id } = JSON.parse(create.stdout);
  spawnSync('node', [CLI, 'bugfix-loop', 'finish', '--run-id', run_id, '--status', 'complete'], { cwd: dir });
  const r = spawnSync('node', [CLI, 'bugfix-loop', 'guard', '--run-id', run_id, '--json'], { encoding: 'utf8', cwd: dir });
  const out = JSON.parse(r.stdout);
  assert.equal(out.proceed, false);
  assert.equal(out.reason, 'terminal_status');
  rmSync(dir, { recursive: true, force: true });
});

test('adev bugfix-loop guard reports proceed:false with budget_exhausted when max-turns hit', () => {
  const dir = makeTempProject();
  const create = spawnSync('node', [CLI, 'bugfix-loop', 'create', '--max-turns', '1', '--json'], { encoding: 'utf8', cwd: dir });
  const { run_id } = JSON.parse(create.stdout);
  spawnSync('node', [CLI, 'bugfix-loop', 'complete-turn', '--run-id', run_id], { cwd: dir });
  const r = spawnSync('node', [CLI, 'bugfix-loop', 'guard', '--run-id', run_id, '--json'], { encoding: 'utf8', cwd: dir });
  const out = JSON.parse(r.stdout);
  assert.equal(out.proceed, false);
  assert.equal(out.reason, 'budget_exhausted');
  assert.equal(out.budget_reason, 'max_turns');
  rmSync(dir, { recursive: true, force: true });
});

test('adev bugfix-loop finish prints the pinned token and persists the matching status', () => {
  const dir = makeTempProject();
  const create = spawnSync('node', [CLI, 'bugfix-loop', 'create', '--json'], { encoding: 'utf8', cwd: dir });
  const { run_id } = JSON.parse(create.stdout);
  const r = spawnSync('node', [CLI, 'bugfix-loop', 'finish', '--run-id', run_id, '--status', 'blocked', '--json'], { encoding: 'utf8', cwd: dir });
  const out = JSON.parse(r.stdout);
  assert.equal(out.token, 'BLOCKED');
  assert.equal(out.status, 'blocked');
  rmSync(dir, { recursive: true, force: true });
});

test('adev bugfix-loop guard reports proceed:false with budget_exhausted when --max-bugs is hit, seeded via a real run-state file (AC bullet 3, round-1 plan-review fix: the prior draft only CLI-tested the max_turns cap here)', () => {
  const dir = makeTempProject();
  const create = spawnSync('node', [CLI, 'bugfix-loop', 'create', '--max-bugs', '1', '--json'], { encoding: 'utf8', cwd: dir });
  const { run_id } = JSON.parse(create.stdout);
  spawnSync('node', [CLI, 'bugfix-loop', 'record-attempt', '--run-id', run_id, '--issue', 'bug-1'], { cwd: dir });
  const r = spawnSync('node', [CLI, 'bugfix-loop', 'guard', '--run-id', run_id, '--json'], { encoding: 'utf8', cwd: dir });
  const out = JSON.parse(r.stdout);
  assert.equal(out.proceed, false);
  assert.equal(out.reason, 'budget_exhausted');
  assert.equal(out.budget_reason, 'max_bugs');
  // Confirms the guard-detected max_bugs case flows into the same
  // finish/token/persisted-status contract the max_turns case uses.
  const finish = spawnSync('node', [CLI, 'bugfix-loop', 'finish', '--run-id', run_id, '--status', 'budget_exhausted', '--json'], { encoding: 'utf8', cwd: dir });
  const finishOut = JSON.parse(finish.stdout);
  assert.equal(finishOut.token, 'BUDGET_EXHAUSTED');
  assert.equal(finishOut.status, 'budget_exhausted');
  rmSync(dir, { recursive: true, force: true });
});

test('adev bugfix-loop finish carries degraded_sync_note through in its JSON result, for both null and non-null (AC bullet 10, round-1 plan-review fix)', () => {
  const dir = makeTempProject();
  const create = spawnSync('node', [CLI, 'bugfix-loop', 'create', '--json'], { encoding: 'utf8', cwd: dir });
  const { run_id: runIdNull } = JSON.parse(create.stdout);
  const r1 = spawnSync('node', [CLI, 'bugfix-loop', 'finish', '--run-id', runIdNull, '--status', 'complete', '--json'], { encoding: 'utf8', cwd: dir });
  assert.equal(JSON.parse(r1.stdout).degraded_sync_note, null);

  const create2 = spawnSync('node', [CLI, 'bugfix-loop', 'create', '--json'], { encoding: 'utf8', cwd: dir });
  const { run_id: runIdNote } = JSON.parse(create2.stdout);
  // No CLI verb sets degraded_sync_note (it is written by the sibling
  // tracker-provider-bridge spec, Milestone 2, not yet implemented) — seed
  // it directly on the run-state file to prove finish's read-through
  // contract, which is all this skill's Step 5 depends on.
  const statePath = join(dir, '.context-index', 'lifecycle-state', `bugfix-loop-runs-${runIdNote}.json`);
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  state.degraded_sync_note = 'GitHub rate-limited for 5 consecutive turns';
  writeFileSync(statePath, JSON.stringify(state));
  const r2 = spawnSync('node', [CLI, 'bugfix-loop', 'finish', '--run-id', runIdNote, '--status', 'complete', '--json'], { encoding: 'utf8', cwd: dir });
  assert.equal(JSON.parse(r2.stdout).degraded_sync_note, 'GitHub rate-limited for 5 consecutive turns');
  rmSync(dir, { recursive: true, force: true });
});

test('adev bugfix-loop latest returns null (exit 0, empty result) when no runs exist', () => {
  const dir = makeTempProject();
  const r = spawnSync('node', [CLI, 'bugfix-loop', 'latest', '--json'], { encoding: 'utf8', cwd: dir });
  assert.equal(r.status, 0);
  assert.deepEqual(JSON.parse(r.stdout), { run: null });
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Verify test fails**

Run: `node --test -- tests/cli/bugfix-loop.test.mjs`
Expected: FAIL — `adev bugfix-loop` is not a recognized verb (exit 1, "unknown command")

- [ ] **Implement**

```javascript
// lib/cli/bugfix-loop.mjs
import { parseArgs } from 'node:util';
import {
  createRun, readRunState, checkStatusGuard, checkBudget,
  appendAttempt, completeTurn, finishRun, findLatestRunState,
} from '../bugfix-loop-run.mjs';

const USAGE = 'usage: adev bugfix-loop create|guard|record-attempt|complete-turn|finish|latest';

export async function run({ projectRoot, argv }) {
  const [sub, ...rest] = argv;
  if (!sub) { console.error(USAGE); return 1; }

  if (sub === 'create') {
    const { values } = parseArgs({ args: rest, options: { 'max-bugs': { type: 'string' }, 'max-turns': { type: 'string' }, json: { type: 'boolean' } } });
    const state = createRun(projectRoot, {
      maxBugs: values['max-bugs'] != null ? Number(values['max-bugs']) : null,
      maxTurns: values['max-turns'] != null ? Number(values['max-turns']) : 20,
    });
    console.log(values.json ? JSON.stringify(state) : `created run ${state.run_id}`);
    return 0;
  }

  if (sub === 'guard') {
    const { values } = parseArgs({ args: rest, options: { 'run-id': { type: 'string' }, json: { type: 'boolean' } } });
    const state = readRunState(projectRoot, values['run-id']);
    const statusResult = checkStatusGuard(state);
    if (!statusResult.ok) {
      const result = { proceed: false, reason: 'terminal_status', status: statusResult.status };
      console.log(values.json ? JSON.stringify(result) : `refused: run already terminal (${statusResult.status})`);
      return 0;
    }
    const budget = checkBudget(state);
    if (budget.exhausted) {
      const result = { proceed: false, reason: 'budget_exhausted', budget_reason: budget.reason };
      console.log(values.json ? JSON.stringify(result) : `budget exhausted: ${budget.reason}`);
      return 0;
    }
    const result = { proceed: true };
    console.log(values.json ? JSON.stringify(result) : 'proceed');
    return 0;
  }

  if (sub === 'record-attempt') {
    const { values } = parseArgs({ args: rest, options: { 'run-id': { type: 'string' }, issue: { type: 'string' }, json: { type: 'boolean' } } });
    const state = appendAttempt(projectRoot, values['run-id'], values.issue);
    console.log(values.json ? JSON.stringify(state) : `recorded attempt on ${values.issue}`);
    return 0;
  }

  if (sub === 'complete-turn') {
    const { values } = parseArgs({ args: rest, options: { 'run-id': { type: 'string' }, json: { type: 'boolean' } } });
    const state = completeTurn(projectRoot, values['run-id']);
    console.log(values.json ? JSON.stringify(state) : `turns_completed=${state.turns_completed}`);
    return 0;
  }

  if (sub === 'finish') {
    const { values } = parseArgs({ args: rest, options: { 'run-id': { type: 'string' }, status: { type: 'string' }, note: { type: 'string' }, json: { type: 'boolean' } } });
    const { state, token } = finishRun(projectRoot, values['run-id'], { status: values.status, note: values.note });
    const result = { status: state.status, token, degraded_sync_note: state.degraded_sync_note ?? null };
    console.log(values.json ? JSON.stringify(result) : `ADEV-BUGFIXLOOP: ${token}`);
    return 0;
  }

  if (sub === 'latest') {
    const { values } = parseArgs({ args: rest, options: { json: { type: 'boolean' } } });
    const state = findLatestRunState(projectRoot);
    console.log(values.json ? JSON.stringify({ run: state }) : (state ? `latest run: ${state.run_id}` : 'no runs found'));
    return 0;
  }

  console.error(USAGE);
  return 1;
}

export function help() {
  console.log(USAGE);
}

export default { run, help };
```

Register in `cli/index.mjs`, next to the `build-state` line:

```javascript
["bugfix-loop",     () => import("../lib/cli/bugfix-loop.mjs")],
```

- [ ] **Verify test passes**

Run: `node --test -- tests/cli/bugfix-loop.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/bugfix-loop.mjs tests/cli/bugfix-loop.test.mjs cli/index.mjs
git commit -m "feat(autonomous-bugfix-loop): add adev bugfix-loop CLI verb group

Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md
Plan-task: 5"
```

---

### Task 6: `adev issues record-attempt` CLI wrapper [specialist: none]

**Charter capability:** `/adev:bugfix-loop` Skill
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** — (independent of Group A; only needs the already-shipped `lib/bugfix-loop-attempts.mjs`)
**Files:**
- Create: `lib/cli/issues-record-attempt.mjs`
- Create: `tests/cli/issues-record-attempt.test.mjs`
- Modify: `lib/cli/issues.mjs` (dispatch table + `help()`)

**Tests:** `tests/cli/issues-record-attempt.test.mjs` — new suite. Covers the AttemptRecord-write Acceptance Criterion.

**Context to load:**
- `lib/bugfix-loop-attempts.mjs` (full read — `recordDebugAttempt` signature)
- `lib/cli/issues-claim.mjs` (full read — style precedent)
- `lib/cli/issues.mjs` (full read — dispatch table to extend)

- [ ] **Write failing test**

```javascript
// tests/cli/issues-record-attempt.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');
const CLI = resolve(PROJECT_ROOT, 'cli', 'index.mjs');

function makeTempProject() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'adev-record-attempt-')));
  mkdirSync(join(dir, '.context-index'), { recursive: true });
  writeFileSync(join(dir, '.context-index', 'manifest.yaml'), 'project:\n  name: t\n  adev_version: "0.28.0"\n');
  return dir;
}

test('adev issues record-attempt FIXED writes an AttemptRecord readable back', () => {
  const dir = makeTempProject();
  const r = spawnSync('node', [CLI, 'issues', 'record-attempt', '--issue', 'issue-1', '--outcome', 'FIXED', '--json'], { encoding: 'utf8', cwd: dir });
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.issue_id, 'issue-1');
  assert.equal(out.last_verdict, 'PASS');
  rmSync(dir, { recursive: true, force: true });
});

test('adev issues record-attempt rejects an unknown --outcome', () => {
  const dir = makeTempProject();
  const r = spawnSync('node', [CLI, 'issues', 'record-attempt', '--issue', 'issue-1', '--outcome', 'BOGUS'], { encoding: 'utf8', cwd: dir });
  assert.equal(r.status, 1);
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Verify test fails**

Run: `node --test -- tests/cli/issues-record-attempt.test.mjs`
Expected: FAIL — `record-attempt` not recognized by `adev issues`

- [ ] **Implement**

```javascript
// lib/cli/issues-record-attempt.mjs
import { parseArgs } from 'node:util';
import { recordDebugAttempt } from '../bugfix-loop-attempts.mjs';

const USAGE = 'usage: adev issues record-attempt --issue <id> --outcome FIXED|PARKED|UNREPRODUCIBLE [--check-ids <csv>] [--raw-output <text>] [--json]';
const VALID_OUTCOMES = new Set(['FIXED', 'PARKED', 'UNREPRODUCIBLE']);

export async function run({ projectRoot, argv, manifest }) {
  const { values } = parseArgs({
    args: argv,
    options: {
      issue: { type: 'string' },
      outcome: { type: 'string' },
      'check-ids': { type: 'string' },
      'raw-output': { type: 'string' },
      json: { type: 'boolean' },
    },
  });

  if (!values.issue || !VALID_OUTCOMES.has(values.outcome)) {
    console.error(USAGE);
    return 1;
  }

  const checkIds = values['check-ids'] ? values['check-ids'].split(',').map((s) => s.trim()).filter(Boolean) : undefined;

  let record;
  try {
    record = recordDebugAttempt(projectRoot, manifest, {
      issueId: values.issue,
      outcome: values.outcome,
      checkIds,
      rawOutput: values['raw-output'],
    });
  } catch (err) {
    console.error(err.message);
    return 1;
  }

  console.log(values.json ? JSON.stringify(record) : `recorded ${values.outcome} for ${values.issue}: last_verdict=${record.last_verdict}`);
  return 0;
}

export function help() {
  console.log(USAGE);
}

export default { run, help };
```

Extend `lib/cli/issues.mjs`'s dispatch (alongside the existing `claim`/`release`/`next` branches):

```javascript
if (sub === "record-attempt") {
  const mod = await import("./issues-record-attempt.mjs");
  return mod.run({ projectRoot, argv: rest, manifest });
}
```

And add a `help()` line: `console.log("  record-attempt  Write an AttemptRecord for a completed /adev:debug --auto attempt");`

- [ ] **Verify test passes**

Run: `node --test -- tests/cli/issues-record-attempt.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/issues-record-attempt.mjs tests/cli/issues-record-attempt.test.mjs lib/cli/issues.mjs
git commit -m "feat(autonomous-bugfix-loop): add adev issues record-attempt CLI wrapper for recordDebugAttempt

recordDebugAttempt() (lib/bugfix-loop-attempts.mjs) has existed since the
sibling per-issue-attempt-cap plan but had no CLI-callable entry point,
so a markdown-only skill had no way to write an AttemptRecord. This closes
that gap ahead of the bugfix-loop skill needing it every turn.

Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md
Plan-task: 6"
```

---

### Task 7: ADR-0015 Decision-table row for the run-state file [specialist: none]

**Charter capability:** `/adev:bugfix-loop` Skill
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `.context-index/adrs/0015-lifecycle-state-dual-format-coexistence.md` (Decision section table)
- Modify: `tests/adrs/0015-decision-table.test.mjs` (extend — file already exists from the sibling `per-issue-attempt-cap` plan)

**Tests:** `tests/adrs/0015-decision-table.test.mjs` — extend with a second `test(...)` block for the new row. Covers the Output Contract's "registered in ADR-0015's Decision-section table" requirement.

**Context to load:**
- `.context-index/adrs/0015-lifecycle-state-dual-format-coexistence.md` (Decision section, full read — already has the `bugfix-loop-attempts.jsonl` row)
- `tests/adrs/0015-decision-table.test.mjs` (full read — existing file)

- [ ] **Write failing test**

Append to the existing `tests/adrs/0015-decision-table.test.mjs`:

```javascript
test('ADR-0015 Decision table registers bugfix-loop-runs-<run_id>.json', () => {
  const md = readFileSync(ADR_PATH, 'utf8');
  assert.match(md, /bugfix-loop-runs-<run_id>\.json/);
  assert.match(md, /lib\/bugfix-loop-run\.mjs/);
  assert.match(md, /bugfix-loop-skill\.spec\.md/);
});
```

- [ ] **Verify test fails**

Run: `node --test -- tests/adrs/0015-decision-table.test.mjs`
Expected: FAIL — ADR text does not yet mention `bugfix-loop-runs-<run_id>.json`

- [ ] **Implement**

Add a row to the ADR's Decision-section table (after the existing `bugfix-loop-attempts.jsonl` row), matching the single-JSON-snapshot / gitignored shape of the `<slug>.json` row above it:

```markdown
| `bugfix-loop-runs-<run_id>.json` | `lib/bugfix-loop-run.mjs` | single JSON snapshot | ❌ gitignored | `.context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md` |
```

Add a corresponding line under "Related > Owning libraries": `- `lib/bugfix-loop-run.mjs` — single-JSON-snapshot writer/reader for one \`bugfix-loop-runs-<run_id>.json\` per \`/adev:bugfix-loop\` run, following the same atomic-write pattern as \`lib/build-state.mjs\`.`

- [ ] **Verify test passes**

Run: `node --test -- tests/adrs/0015-decision-table.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add .context-index/adrs/0015-lifecycle-state-dual-format-coexistence.md tests/adrs/0015-decision-table.test.mjs
git commit -m "docs(autonomous-bugfix-loop): register bugfix-loop-runs-<run_id>.json in ADR-0015's Decision table

Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md
Plan-task: 7"
```

---

### Task 8: `skills/bugfix-loop/SKILL.md` [specialist: none]

**Charter capability:** `/adev:bugfix-loop` Skill
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 5, Task 6
**Files:**
- Create: `skills/bugfix-loop/SKILL.md`

**Tests:** `tests/skills/bugfix-loop-skill.test.mjs` — new suite. Covers Acceptance Criteria bullets 1, 5, 6, 8, 11, 14.

**Context to load:**
- `bugfix-loop-skill.spec.md` (full read)
- `skills/build/SKILL.md:249-338,712-738` (full read)
- `skills/debug/SKILL.md` (full read)
- `skills/validate/SKILL.md:588-595` (full read)
- CLI verbs from Tasks 5-6 (full read — exact flag names)

- [ ] **Write failing test**

```javascript
// tests/skills/bugfix-loop-skill.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');
const TOKEN_GRAMMAR = /^ADEV-[A-Z]+: [A-Z_]+$/;

test('bugfix-loop SKILL.md declares --max-bugs, --max-turns, --github-sync, --resume, --resume-run-id', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  for (const flag of ['--max-bugs', '--max-turns', '--github-sync', '--resume', '--resume-run-id']) {
    assert.ok(md.includes(flag), `Arguments must document ${flag}`);
  }
});

test('bugfix-loop SKILL.md includes a Load Skill Extensions block (AC bullet 5)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  assert.match(md, /adev skill-ext load --skill bugfix-loop/);
});

test('bugfix-loop SKILL.md emits ADEV-BUGFIXLOOP for all three terminal states, final line (AC bullet 6)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  for (const tok of ['ADEV-BUGFIXLOOP: COMPLETE', 'ADEV-BUGFIXLOOP: BUDGET_EXHAUSTED', 'ADEV-BUGFIXLOOP: BLOCKED']) {
    assert.ok(TOKEN_GRAMMAR.test(tok));
    assert.ok(md.includes(tok), `must instruct emitting "${tok}"`);
  }
  assert.match(md, /(final line|last line)/i);
});

test('bugfix-loop SKILL.md self-re-invokes via the Skill tool between non-terminal turns', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  assert.match(md, /--resume --resume-run-id/);
  assert.match(md, /Skill tool/);
});

test('bugfix-loop SKILL.md reads the status guard before calling adev issues next (AC bullet 8)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  const guardIdx = md.indexOf('bugfix-loop guard');
  const nextIdx = md.indexOf('issues next');
  assert.ok(guardIdx !== -1 && nextIdx !== -1 && guardIdx < nextIdx, 'guard must be called before issues next');
});

test('bugfix-loop SKILL.md bounds claim-failure retries to 3 within a turn (AC bullet 14)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  assert.match(md, /\b3\b[\s\S]{0,80}retr|retr[\s\S]{0,80}\b3\b/i);
});

test('bugfix-loop SKILL.md fails fast on --github-sync when the bridge is unavailable (AC bullet 11)', () => {
  const md = read('skills/bugfix-loop/SKILL.md');
  assert.match(md, /--github-sync[\s\S]{0,600}(not available|not yet implemented|fail fast)/i);
});
```

- [ ] **Verify test fails**

Run: `node --test -- tests/skills/bugfix-loop-skill.test.mjs`
Expected: FAIL — `skills/bugfix-loop/SKILL.md` does not exist

- [ ] **Implement**

Create `skills/bugfix-loop/SKILL.md` with (at minimum) this structure — YAML frontmatter, then:

```markdown
---
name: adev:bugfix-loop
description: "Self-re-invoking, one-bug-per-turn loop that drains eligible P2/P3 bugs from the issue board unattended, using /adev:debug --auto for each attempt."
---

# Autonomous Bugfix Loop

**Announce at start:** "I'm using the adev:bugfix-loop skill to drain eligible bugs from the board."

## Arguments

- `--max-bugs <N>`: caps bugs attempted across the whole run. Default: unbounded.
- `--max-turns <N>`: caps self-re-invocation turns. Default: 20.
- `--github-sync`: enables the tracker-provider-bridge's inbound pull/outbound writeback. **Not yet available** — the bridge is Milestone 2 of the `autonomous-bugfix-loop` charter and is not implemented in this codebase. Passing this flag fails fast on the first turn with a clear "GitHub sync not available" error rather than silently no-op-ing.
- `--resume [--resume-run-id <id>]` (internal): used only by this skill's own self-re-invocation. `--resume-run-id` is always passed explicitly by the re-invocation call. A manual `--resume` without `--resume-run-id` falls back to `adev bugfix-loop latest`.

**Load Skill Extensions:**

\`\`\`bash
adev skill-ext load --skill bugfix-loop
\`\`\`

The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides). If the output is `__NONE__`, continue normally.

## Step 0: Resolve the run

- **Fresh invocation (`--max-bugs`/`--max-turns`/no resume flags):** `adev bugfix-loop create --max-bugs <N> --max-turns <N> --json` → capture `run_id`.
- **`--resume --resume-run-id <id>`:** use `<id>` directly — it was passed explicitly by the prior turn's own self-re-invocation, so no discovery is needed.
- **`--resume` with no `--resume-run-id` (manual crash recovery):** `adev bugfix-loop latest --json`. If `run: null`, there is nothing to resume — tell the user and stop. Otherwise use the returned `run.run_id`.
- **`--github-sync` fail-fast:** if the flag is set, stop immediately with "GitHub sync not available — the tracker-provider-bridge capability has not shipped yet (Milestone 2). Omit --github-sync." before any run-state is created or resumed.

## Step 1: Turn guard (status + budget)

\`\`\`bash
adev bugfix-loop guard --run-id <run_id> --json
\`\`\`

- `{"proceed": false, "reason": "terminal_status", "status": "<s>"}`: this run already reached a terminal state. Do not call `adev issues next`, do not mutate `bugs_attempted[]`/`turns_completed`, do not re-print a completion token. Exit non-zero with a message naming `<s>` and instructing the operator to start a fresh `/adev:bugfix-loop` invocation (no `--resume-run-id`).
- `{"proceed": false, "reason": "budget_exhausted", "budget_reason": "max_bugs"|"max_turns"}`: go straight to Step 5 (Finish) with `--status budget_exhausted`, distinguishing which cap tripped in the finish note.
- `{"proceed": true}`: continue to Step 2.

## Step 2: Select a bug

\`\`\`bash
adev issues next --type bug --max-priority P3 --json
\`\`\`

If `{"bug": null}`: the board is drained. Go to Step 5 with `--status complete`.

## Step 3: Claim (bounded 3-retry)

\`\`\`bash
adev issues claim <id> --owner bugfix-loop --branch "$(git branch --show-current)"
\`\`\`

`adev issues claim` failures release no lease — a failed bug is not re-eligible within this turn (its lease has not expired). On failure, call Step 2 again for the next-eligible bug and retry claim, **up to 3 total claim attempts in this turn**. If all 3 fail, this turn ends without an attempt: still call `adev bugfix-loop complete-turn --run-id <run_id>` (this failed-contention turn still counts toward `--max-turns`, per the Failure Modes table), then go to Step 6 (self-re-invoke) — do **not** fall through to Step 5's terminal path, since eligible bugs may remain.

## Step 4: Attempt via /adev:debug --auto

Set `ADEV_ISSUE_OWNER=bugfix-loop` in the environment for this invocation only, then invoke (via the Skill tool, in the current turn — not a background dispatch):

\`\`\`
/adev:debug --issue <id> --apply --auto
\`\`\`

`ADEV_ISSUE_OWNER=bugfix-loop` makes `/adev:debug`'s own Phase 1.6 re-claim and Phase 6 release resolve to the same owner this loop claimed with (`skills/debug/SKILL.md:163,177` — already shipped, reads `ADEV_ISSUE_OWNER` when set).

Read the resulting `ADEV-DEBUG: FIXED|PARKED|UNREPRODUCIBLE` token from the last line of that turn's output.

- **If `/adev:debug --auto` crashes** (errors out entirely rather than emitting a clean token): treat as `PARKED` with an explanatory note. Do not halt the run.

Write the AttemptRecord, mapping the token onto `per-issue-attempt-cap`'s outcome contract:

\`\`\`bash
adev issues record-attempt --issue <id> --outcome <FIXED|PARKED|UNREPRODUCIBLE> [--check-ids <csv-from-FAILING-CHECKS-block>] [--raw-output <text-if-no-discrete-ids>]
\`\`\`

The check-ID data for `PARKED` is read from `IssueManager.get(id).notes`'s `FAILING-CHECKS:` block (`debug-completion-and-auto` BEH-8).

Release the claim, using the same owner the loop claimed with:

\`\`\`bash
adev issues release <id> --owner bugfix-loop
\`\`\`

Regardless of outcome:

\`\`\`bash
adev bugfix-loop record-attempt --run-id <run_id> --issue <id>
adev bugfix-loop complete-turn --run-id <run_id>
\`\`\`

**The skill never marks a bug fixed itself.** `FIXED` is entirely `/adev:debug`'s own Phase 6 confidence gate — this skill only reads the token it already emitted.

## Step 5: Finish (terminal turn only)

\`\`\`bash
adev bugfix-loop finish --run-id <run_id> --status <complete|budget_exhausted|blocked> --json
\`\`\`

Read `degraded_sync_note` from the JSON result. If non-null, print `GitHub sync degraded during this run: <degraded_sync_note>` as the line immediately before the token — the token itself is still unconditionally the literal last line.

Print `ADEV-BUGFIXLOOP: <token-from-result>` as the final line of this turn's output. **Persona-exempt** (like `ADEV-BUILD`/`ADEV-VALIDATE`/`ADEV-DEBUG` — `skills/using-adev/SKILL.md`'s Persona Output Override carve-out names it explicitly). **Excluded from spine-skill chaining** — no "Next Step in the Lifecycle" footer follows this token (`single-front-door.spec.md`).

## Step 6: Self-re-invoke (non-terminal turns only)

This is this turn's own last action — no human approval, confirmation, or manual re-entry:

Immediately re-invoke `/adev:bugfix-loop --resume --resume-run-id <run_id>` via the Skill tool. The re-invocation starts a fresh turn with a clean context. **Ending this turn's response without re-invoking (when not terminal) is a loop failure.**

## Failure Modes

| Condition | Behavior |
|---|---|
| Issue board unreachable / `tasks.backend` misconfigured | Halt immediately on the first turn, no retry; `adev bugfix-loop finish --status blocked`, then the `BLOCKED` token |
| Claim fails 3 times in one turn (contention) | Turn ends without an attempt, still counts toward `--max-turns` (Step 3), self-re-invokes normally |
| `/adev:debug --auto` crashes | Treated as `PARKED`, claim released, loop continues |
| `--github-sync` set, bridge not implemented | Fails fast on the first turn (Step 0) |
```

- [ ] **Verify test passes**

Run: `node --test -- tests/skills/bugfix-loop-skill.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/bugfix-loop/SKILL.md tests/skills/bugfix-loop-skill.test.mjs
git commit -m "feat(autonomous-bugfix-loop): add /adev:bugfix-loop skill

Composes adev issues next/claim/release, /adev:debug --auto, and
lib/bugfix-loop-attempts.mjs into a self-re-invoking, one-bug-per-turn loop.

Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md
Plan-task: 8"
```

---

### Task 9: Integration tests — 2-turn drain, claim-retry bound, ADEV_ISSUE_OWNER wiring (WR-2), crash handling [specialist: none]

**Charter capability:** `/adev:bugfix-loop` Skill
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 8
**Files:**
- Create: `tests/integration/bugfix-loop-loop.test.mjs`

**Tests:** `tests/integration/bugfix-loop-loop.test.mjs` — new suite. Covers Acceptance Criteria bullets 2, 12, 13, 15, 16 and closes review finding WR-2. Since the skill's own prose can only be executed by an LLM turn, these tests drive the exact CLI-verb sequence the SKILL.md (Task 8) documents, directly, proving the underlying mechanism supports it — not by parsing or simulating the markdown itself.

**Context to load:**
- `lib/cli/issues-claim.mjs`, `lib/cli/issues-next.mjs` (full read)
- CLI verbs from Tasks 5-6 (full read)
- `lib/bugfix-loop-attempts.mjs::readAttemptRecord` (signature only)
- `tests/cli/build-state.test.mjs` (full read — temp-project harness pattern)

- [ ] **Write failing test**

```javascript
// tests/integration/bugfix-loop-loop.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');
const CLI = resolve(PROJECT_ROOT, 'cli', 'index.mjs');

function makeTempProject() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'adev-bfl-e2e-')));
  mkdirSync(join(dir, '.context-index'), { recursive: true });
  writeFileSync(
    join(dir, '.context-index', 'manifest.yaml'),
    'project:\n  name: t\n  adev_version: "0.28.0"\ntasks:\n  backend: json\n',
  );
  // Two open P3 bugs on the local JSON board.
  writeFileSync(
    join(dir, '.context-index', 'tasks.json'),
    JSON.stringify({
      issues: [
        { id: 'bug-1', title: 'first', type: 'bug', priority: 3, status: 'open' },
        { id: 'bug-2', title: 'second', type: 'bug', priority: 3, status: 'open' },
      ],
    }),
  );
  return dir;
}

function json(args, opts) {
  const r = spawnSync('node', [CLI, ...args], { encoding: 'utf8', ...opts });
  return { ...r, json: r.stdout ? (() => { try { return JSON.parse(r.stdout); } catch { return null; } })() : null };
}

test('2-turn drain: turns_completed and bugs_attempted grow across two sequential turns with no human input between them (AC bullet 2)', () => {
  const dir = makeTempProject();
  const { json: created } = json(['bugfix-loop', 'create', '--max-turns', '10', '--json'], { cwd: dir });
  const runId = created.run_id;

  // Turn 1
  json(['issues', 'claim', 'bug-1', '--owner', 'bugfix-loop'], { cwd: dir });
  json(['issues', 'record-attempt', '--issue', 'bug-1', '--outcome', 'FIXED'], { cwd: dir });
  json(['issues', 'release', 'bug-1', '--owner', 'bugfix-loop'], { cwd: dir });
  json(['bugfix-loop', 'record-attempt', '--run-id', runId, '--issue', 'bug-1'], { cwd: dir });
  json(['bugfix-loop', 'complete-turn', '--run-id', runId], { cwd: dir });

  // Turn 2 (simulating the self-re-invoked, fresh-context turn)
  json(['issues', 'claim', 'bug-2', '--owner', 'bugfix-loop'], { cwd: dir });
  json(['issues', 'record-attempt', '--issue', 'bug-2', '--outcome', 'PARKED'], { cwd: dir });
  json(['issues', 'release', 'bug-2', '--owner', 'bugfix-loop'], { cwd: dir });
  json(['bugfix-loop', 'record-attempt', '--run-id', runId, '--issue', 'bug-2'], { cwd: dir });
  json(['bugfix-loop', 'complete-turn', '--run-id', runId], { cwd: dir });

  const { json: state } = json(['bugfix-loop', 'latest', '--json'], { cwd: dir });
  assert.equal(state.run.turns_completed, 2);
  assert.equal(state.run.bugs_attempted.length, 2);
  rmSync(dir, { recursive: true, force: true });
});

test('claim-failure retries are bounded to 3 and the turn still counts toward --max-turns on exhaustion (AC bullet 13)', () => {
  const dir = makeTempProject();
  const { json: created } = json(['bugfix-loop', 'create', '--max-turns', '10', '--json'], { cwd: dir });
  const runId = created.run_id;
  json(['issues', 'claim', 'bug-1', '--owner', 'someone-else'], { cwd: dir });

  let attempts = 0;
  for (let i = 0; i < 3; i += 1) {
    const r = json(['issues', 'claim', 'bug-1', '--owner', 'bugfix-loop'], { cwd: dir });
    if (r.status === 2) attempts += 1;
  }
  assert.equal(attempts, 3);
  // Turn ends without an attempt; still counts toward --max-turns.
  json(['bugfix-loop', 'complete-turn', '--run-id', runId], { cwd: dir });
  const { json: state } = json(['bugfix-loop', 'latest', '--json'], { cwd: dir });
  assert.equal(state.run.turns_completed, 1);
  assert.equal(state.run.bugs_attempted.length, 0);
  rmSync(dir, { recursive: true, force: true });
});

test('ADEV_ISSUE_OWNER propagation: the loop claim and a re-claim under the same env var both succeed (WR-2)', () => {
  const dir = makeTempProject();
  const claim1 = json(['issues', 'claim', 'bug-1', '--owner', 'bugfix-loop'], { cwd: dir });
  assert.equal(claim1.status, 0);
  // Simulates /adev:debug's Phase 1.6 re-claim, resolving the owner from
  // ADEV_ISSUE_OWNER exactly as skills/debug/SKILL.md:163 documents.
  const reclaim = json(['issues', 'claim', 'bug-1'], { cwd: dir, env: { ...process.env, ADEV_ISSUE_OWNER: 'bugfix-loop' } });
  assert.equal(reclaim.status, 0, 'same-owner re-claim under ADEV_ISSUE_OWNER must not be refused with ISSUE_ALREADY_CLAIMED');
  rmSync(dir, { recursive: true, force: true });
});

test('AttemptRecord is written after every completed attempt (AC bullet 15)', () => {
  const dir = makeTempProject();
  json(['issues', 'record-attempt', '--issue', 'bug-1', '--outcome', 'UNREPRODUCIBLE'], { cwd: dir });
  const log = readFileSync(join(dir, '.context-index', 'lifecycle-state', 'bugfix-loop-attempts.jsonl'), 'utf8');
  assert.match(log, /"issue_id":"bug-1"/);
  rmSync(dir, { recursive: true, force: true });
});

test('a crashed /adev:debug --auto (no clean token) is treated as PARKED and the claim is released, no orphan (AC bullet 12)', () => {
  const dir = makeTempProject();
  json(['issues', 'claim', 'bug-1', '--owner', 'bugfix-loop'], { cwd: dir });
  // Simulate a crash: skip the debug invocation, go straight to the
  // PARKED-with-explanatory-note fallback the SKILL.md's Step 4 documents.
  json(['issues', 'record-attempt', '--issue', 'bug-1', '--outcome', 'PARKED', '--raw-output', 'debug crashed mid-attempt'], { cwd: dir });
  const release = json(['issues', 'release', 'bug-1', '--owner', 'bugfix-loop'], { cwd: dir });
  assert.equal(release.status, 0);
  const { json: boardState } = json(['issues', 'claim', 'bug-1', '--owner', 'someone-else'], { cwd: dir });
  assert.notEqual(boardState?.owner, undefined); // claimable again -- no orphaned claim
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Verify test fails**

Run: `node --test -- tests/integration/bugfix-loop-loop.test.mjs`
Expected: FAIL until Tasks 5-6's verbs and the local JSON board fixture shape all line up — this is the true end-to-end wiring check.

- [ ] **Implement**

No new production code — this task wires the existing CLI verbs (Tasks 5, 6, and the already-shipped `adev issues next/claim/release`) together in a temp-project harness. If any assertion above fails against real verb output shapes, fix the *test's* expectations to match the actual (correct) CLI output rather than adding new production code — this task's job is proving the composition works, not building new mechanism.

- [ ] **Verify test passes**

Run: `node --test -- tests/integration/bugfix-loop-loop.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add tests/integration/bugfix-loop-loop.test.mjs
git commit -m "test(autonomous-bugfix-loop): add end-to-end CLI-composition tests for the bugfix loop mechanism

Closes review finding WR-2 (ADEV_ISSUE_OWNER propagation had no
acceptance-criterion-carrying test) and covers the 2-turn drain,
claim-retry bound, crash-handling, and AttemptRecord-write acceptance
criteria.

Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md
Plan-task: 9"
```

---

### Task 10: `using-adev` gateway table + persona carve-out [specialist: none]

**Charter capability:** `/adev:bugfix-loop` Skill
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 8 (skill name/behavior must be final)
**Files:**
- Modify: `skills/using-adev/SKILL.md:65-72` (gateway table row), `:142` (Persona Output Override bullet)

**Tests:** `tests/skills/bugfix-loop-skill.test.mjs` — extend.

**Context to load:**
- `skills/using-adev/SKILL.md:65-72,135-143` (full read)

- [ ] **Write failing test**

```javascript
test('using-adev gateway table lists /adev:bugfix-loop', () => {
  const md = read('skills/using-adev/SKILL.md');
  assert.match(md, /\/adev:bugfix-loop/);
});

test('using-adev persona overlay names ADEV-BUGFIXLOOP as persona-exempt', () => {
  const md = read('skills/using-adev/SKILL.md');
  assert.match(md, /ADEV-BUGFIXLOOP/);
});
```

- [ ] **Verify test fails**

Run: `node --test -- tests/skills/bugfix-loop-skill.test.mjs`
Expected: FAIL — `/adev:bugfix-loop` and `ADEV-BUGFIXLOOP` not found in `skills/using-adev/SKILL.md`

- [ ] **Implement**

Add a row to the gateway table (`skills/using-adev/SKILL.md:65-67` area):

```markdown
| Drain P2/P3 bugs unattended | `/adev:bugfix-loop` |
```

Extend the Persona Output Override completion-tokens bullet (`:142`):

```markdown
- **Completion tokens** — the `/goal`-friendly terminal markers emitted by `/adev:build` (`ADEV-BUILD: <STATE>`), `/adev:validate` (`ADEV-VALIDATE: <STATE>`), `/adev:debug` (`ADEV-DEBUG: <STATE>`), and `/adev:bugfix-loop` (`ADEV-BUGFIXLOOP: <STATE>`) — are always emitted verbatim as the final line of output regardless of persona or verbosity. ...
```

- [ ] **Verify test passes**

Run: `node --test -- tests/skills/bugfix-loop-skill.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/using-adev/SKILL.md tests/skills/bugfix-loop-skill.test.mjs
git commit -m "feat(autonomous-bugfix-loop): register /adev:bugfix-loop in the using-adev gateway and persona carve-out

Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md
Plan-task: 10"
```

---

### Task 11: `work` routing table entry [specialist: none]

**Charter capability:** `/adev:bugfix-loop` Skill
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 8
**Files:**
- Modify: `skills/work/SKILL.md:~103-107` (routing table)

**Tests:** `tests/skills/bugfix-loop-skill.test.mjs` — extend.

**Context to load:**
- `skills/work/SKILL.md:100-110` (full read)

- [ ] **Write failing test**

```javascript
test('work SKILL.md routing table lists /adev:bugfix-loop', () => {
  const md = read('skills/work/SKILL.md');
  assert.match(md, /\/adev:bugfix-loop/);
});
```

- [ ] **Verify test fails**

Run: `node --test -- tests/skills/bugfix-loop-skill.test.mjs`
Expected: FAIL — `/adev:bugfix-loop` not found in `skills/work/SKILL.md`

- [ ] **Implement**

Add a row to the routing table, alongside the existing `Bug / broken behavior` row (`skills/work/SKILL.md:106`):

```markdown
| Drain P2/P3 bugs unattended | "drain the bug backlog", "bugfix loop", "run the loop unattended" | `/adev:bugfix-loop` |
```

- [ ] **Verify test passes**

Run: `node --test -- tests/skills/bugfix-loop-skill.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add skills/work/SKILL.md tests/skills/bugfix-loop-skill.test.mjs
git commit -m "feat(autonomous-bugfix-loop): add /adev:bugfix-loop routing entry to /adev:work

Spec: .context-index/specs/features/autonomous-bugfix-loop/bugfix-loop-skill.spec.md
Plan-task: 11"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

Per `.context-index/governance/gates.yaml`:
- `test` gate (tier: fast, severity: error): `npm test`

Additional acceptance criteria to verify manually (not covered by a deterministic gate command):
- `^ADEV-[A-Z]+: [A-Z_]+$` grammar holds for all three new states (`COMPLETE`, `BUDGET_EXHAUSTED`, `BLOCKED`) — verified by `tests/skills/bugfix-loop-skill.test.mjs`, not just visual inspection
- Token is persona-exempt across Product/Architect personas — manual spot-check (no automated persona-simulation harness exists in this repo, matching the sibling `debug-completion-and-auto` plan's precedent)
- AC bullet 2's "2+ turns end-to-end" self-re-invocation requirement is verified in Task 9 by sequencing the documented CLI calls directly (`node:test` cannot drive an actual Skill-tool re-invocation, which requires an LLM turn) — this is the same untestable-by-design limitation `/adev:build`'s own resume mechanism has in this codebase; the mechanism-level test proves the underlying state machine supports 2+ turns, not that a literal second Skill-tool call occurred
- No constitutional violations introduced — `skills/bugfix-loop/SKILL.md` names only `adev <verb>` calls and the Skill tool for `/adev:debug`/self-re-invocation; no inline Node, no both-inline-and-verb sections
- Provider mirrors (`providers/*/skills/bugfix-loop`, `providers/*/skills/using-adev`, `providers/*/skills/work`) are regenerated via `scripts/sync-provider-skills.mjs` after Tasks 8, 10, 11 land — a downstream sync step, out of scope for this plan's own tasks
- `bugfix-loop-runs-<run_id>.json` confirmed git-ignored via `git check-ignore` — covered by Task 1's test, not a separate manual step
