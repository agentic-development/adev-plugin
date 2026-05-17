<!-- DO NOT EDIT statuses inline — see lifecycle log lib-import-control-flow-extraction.jsonl -->
# Implementation Plan: Lib-Import Control-Flow Extraction

> **Methodology:** adev
> **Charter:** .context-index/specs/features/cli-driver-surface/charter.md (rev 3)
> **Spec:** .context-index/specs/features/cli-driver-surface/lib-import-control-flow-extraction.spec.md (rev 2, review-passed)
> **Review:** PASS_WITH_NOTES (2026-05-17)
> **Platform:** Node.js (ESM, .mjs), node:test, zero external deps

**Goal:** Migrate the three remaining fenced JavaScript control-flow sites in `skills/plan/SKILL.md` and `skills/implement/SKILL.md` into the existing `adev <verb>` CLI surface, replacing each fenced JS block with prose + verb invocation. The migration brings these sites into compliance with the constitutional rule (added 2026-05-17) that fenced JavaScript in SKILL.md must be descriptive-reference only, never executable directive.

**Architecture:** Refactor-only — no new CLI verbs, no schema changes, no test/regex changes. Step 1 is a one-time audit that confirms the existing CLI surface (`adev state current`, `adev state events --event plan_task`, `adev report --type plan-task --status <s>`) already covers all three categories. Steps 2-4 are atomic SKILL.md edits (one per category). The plan is small (4 tasks); each task ships a test that locks the migration in place (assertion: the import line is gone AND the corresponding `adev <verb>` invocation is present). Per-skill atomic discipline: each task's SKILL.md edit deletes the fenced JS block and inserts the verb invocation in the same commit; no intermediate state where both forms coexist in the same H3 section.

**Review notes carried forward (PASS_WITH_NOTES rev 2):** rev 1 had 12 findings (3 warnings, 9 suggestions, 0 blockers); all warnings + applicable suggestions resolved in rev 2.

---

## File Structure

**Create:**
- `tests/lib-import-control-flow-extraction.test.mjs` — assertion that the three named imports (`currentState` / `reportPlanTask` / `filterEvents`) are absent from `skills/plan/SKILL.md` + `skills/implement/SKILL.md`, AND that the corresponding `adev state current` / `adev state events --event plan_task` / `adev report --type plan-task --status <s>` invocations are present in the migrated sites.

**Modify:**
- `skills/plan/SKILL.md:680-701` — replace the fenced JavaScript re-plan-detection + pending-event emission block with prose + `adev state events --spec <p> --event plan_task` (read) + `adev report --type plan-task --spec <p> --plan <p> --task-id <id> --status pending` (write, once per task).
- `skills/implement/SKILL.md:108-123` — replace the fenced JavaScript task-selection `Array.find` block with prose describing the lookup + `adev state current --spec <p>` invocation. The agent picks the first task whose `planTasks[t.id].status` is `pending` / `in_progress` / `undefined` — that lookup is one-line operator-cognitive prose, not a fenced JS block.
- `skills/implement/SKILL.md:129-151` — replace the four fenced JavaScript `reportPlanTask({...})` transition snippets with one prose line + one `adev report --type plan-task --spec <p> --plan <p> --task-id <id> --status <s> [--notes <text>]` invocation per transition (`in_progress` / `done` / `blocked` / `skipped`).
- `.context-index/specs/features/cli-driver-surface/charter.md` Capability Map — advance the "Lib-import control-flow extraction" row's `Status` column from `review-passed` to `implementing` at start of Task 1, then to `implemented` at end of Task 4. No new row.

**Reference (read, do not modify):**
- `.context-index/specs/features/cli-driver-surface/inline-node-extraction-sweep.spec.md` — predecessor spec; its forbidden-pattern regex (`/Run inline Node|node\s+--input-type=module\s+-e|node\s+-e/`) does NOT change. This spec deliberately does not extend it.
- `tests/skills-no-inline-node.test.mjs` — must continue to pass with empty allowlist (it already does; this spec does not modify it).
- `lib/cli/state.mjs` — confirms `adev state current` and `adev state events --event <type>` are in place (audit step 1).
- `lib/cli/report.mjs` — confirms `adev report --type plan-task --status <s>` accepts all four statuses (audit step 1).
- `.context-index/constitution.md:68` — the descriptive-vs-executive fenced-JS anti-pattern this spec migrates to.

---

## Context Packets

### Task 1 Context (Audit)
- Spec: `.context-index/specs/features/cli-driver-surface/lib-import-control-flow-extraction.spec.md` (Migration Path Step 1, Acceptance Criterion 7)
- Charter: `.context-index/specs/features/cli-driver-surface/charter.md` (Capability Map row "Lib-import control-flow extraction"; Invariants 2 + "No new CLI verbs")
- Source files (read-only, signatures):
  - `lib/cli/state.mjs` (look for: `events` subcommand handler, `--event <type>` flag parsing, `filterEvents` import)
  - `lib/cli/report.mjs` (look for: `--type plan-task` branch, accepted `--status` values)
  - `lib/lifecycle-state.mjs` (look for: `filterEvents`, `reportPlanTask`, `currentState` exports — confirm they remain stable)
- Sibling spec: `inline-node-extraction-sweep.spec.md` (predecessor; this spec depends on the verbs it shipped in PRs 2/3/7)
- Constitution: `.context-index/constitution.md:68` (the anti-pattern this migration enforces)
- Heuristics: 3 entries for module `cli-driver-surface` (see Heuristics section below)

### Task 2 Context (Migrate plan/SKILL.md Category C)
- Spec: `.context-index/specs/features/cli-driver-surface/lib-import-control-flow-extraction.spec.md` (Current State Category C, Behavior 2, Acceptance Criterion 2)
- Source file (full read): `skills/plan/SKILL.md` lines 670-720 (Step 7 Execution Handoff section; preserve surrounding prose unchanged)
- Audit findings from Task 1 (commit message): which verbs cover Category C
- Sibling lib: `lib/cli/state.mjs::events` handler (for `--event plan_task` filter shape)
- Sibling lib: `lib/cli/report.mjs::--type plan-task` handler (for `--status pending` write shape)
- Heuristics: 3 entries for module `cli-driver-surface`

### Task 3 Context (Migrate implement/SKILL.md Category A)
- Spec: `lib-import-control-flow-extraction.spec.md` (Current State Category A, Behavior 3, Acceptance Criterion 2)
- Source file (full read): `skills/implement/SKILL.md` lines 100-130 (Task discovery section; preserve surrounding prose)
- Source file (signature only): `skills/plan/SKILL.md:540` (mirror reference to `state.planTasks` — confirm it's already descriptive prose, not a fenced block; if it is fenced, also migrate)
- Audit findings from Task 1 (commit message): confirmation that `adev state current` returns the full `state.planTasks` projection so agent-side picking remains acceptable as one-line prose
- Heuristics: 3 entries for module `cli-driver-surface`

### Task 4 Context (Migrate implement/SKILL.md Category B — four transitions)
- Spec: `lib-import-control-flow-extraction.spec.md` (Current State Category B, Behavior 4, Acceptance Criterion 2)
- Source file (full read): `skills/implement/SKILL.md` lines 125-155 (Task transitions section; preserve surrounding prose)
- Audit findings from Task 1 (commit message): confirmation that `adev report --type plan-task --status <s>` accepts all four statuses (`in_progress` / `done` / `blocked` / `skipped`)
- Cross-cutting reference: `agent-reliable-state-artifacts/plan-task-events.spec.md` (transition semantics — DO NOT re-derive; cite the spec)
- Note on Blocker `notes` guidance (line 153 of implement/SKILL.md) — preserve the ≤200-char + no-stack-traces guidance as inline prose, not as a JS comment in a fenced block (per spec Error Case 2)
- Heuristics: 3 entries for module `cli-driver-surface`

---

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### Heuristic: Use session JSONL for token measurement, not file-size estimates (confidence: medium)
- **Pattern:** When evaluating token consumption or cost of adev skills, parse real session JSONL files from ~/.claude/projects/ (message.usage fields: input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens). Dispatch paired A/B subagents and compare their JSONL data for controlled experiments.
- **Anti-pattern:** Estimate tokens using bytes/4 or hardcoded assumptions about thinking budgets and cache hit rates. These overstate savings by 2-2.5x vs real measurements.
- **Evidence:** 1 observations

### Heuristic: Cache reads are 71% of session cost — minimize context accumulation (confidence: medium)
- **Pattern:** When optimizing token cost, focus on reducing what accumulates in conversation context (output echoes, artifact dumps, verbose subagent returns). Every output token persists as a cache read on all subsequent turns, creating multiplicative amplification.
- **Anti-pattern:** Focus on reducing input token counts (SKILL.md sizes, context packets). Input is <1% of cost; cache reads at 0.1x pricing dominate due to volume (98% of all tokens processed).
- **Evidence:** 1 observations

### Heuristic: Summarized skill output produces equivalent artifact quality (confidence: medium)
- **Pattern:** When a skill writes an artifact to disk (plan, review, validation report), instruct it to return only a structured summary to the conversation. The artifact on disk will be equally complete — the summarization instruction affects echo volume, not reasoning.
- **Anti-pattern:** Assume that shorter output means lower quality artifacts. The model reasons the same way regardless of how much it echoes back. A/B eval showed 12/12 rubric parity with 36% cost savings.
- **Evidence:** 1 observations

---

## Parallelization

- Task 1 (Audit) must complete first — its findings inform Task 2-4 and are required in the implementation commit message (Acceptance Criterion 7).
- Tasks 2, 3, 4 are independent at the file level: Task 2 touches only `skills/plan/SKILL.md`; Tasks 3 + 4 both touch `skills/implement/SKILL.md` but at non-overlapping line ranges (Task 3 at lines 108-123, Task 4 at lines 129-151). To minimize merge friction, run Tasks 3 → 4 sequentially (same file) and Task 2 in parallel.
- The test file `tests/lib-import-control-flow-extraction.test.mjs` (created in Task 1) is shared across all four tasks: Task 1 writes the file with assertions for all migration sites; Tasks 2-4 do not modify the test, they only flip it from RED to GREEN as each migration lands.

Groups:
- Group A (sequential): Task 1 → Task 3 → Task 4 (Task 3 and 4 share implement/SKILL.md)
- Group B (independent, runs in parallel with Group A after Task 1): Task 2 (touches plan/SKILL.md)

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Audit + write failing test | Small | unit | — | 1 create, 0 modify |
| 2 | Migrate plan/SKILL.md Category C (re-plan + pending) | Small | unit | Task 1 | 0 create, 1 modify |
| 3 | Migrate implement/SKILL.md Category A (task-selection) | Small | unit | Task 1 | 0 create, 1 modify |
| 4 | Migrate implement/SKILL.md Category B (four transitions) | Small | unit | Task 3 (same file) | 0 create, 2 modify (SKILL + charter) |

---

## Strategy Assignment

All four tasks use the `unit` strategy (Node.js built-in `node:test`) — the only assertion target is the textual content of two SKILL.md files. No integration tests are needed (no external systems, no databases, no I/O beyond file reads).

Source: fallback (constitution default `npm test` runs `node --test tests/*.test.mjs`). Confidence: high — refactor-only specs with text-content assertions are the canonical fit for the unit strategy.

---

## Task 1: Audit + write failing test [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** Test code is fully specified in the plan, single new test file, standard node:test pattern with strong precedent in tests/ directory.

**Charter capability:** Lib-import control-flow extraction
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/lib-import-control-flow-extraction.test.mjs`

**Tests:** `tests/lib-import-control-flow-extraction.test.mjs`

**Context to load:**
- `.context-index/specs/features/cli-driver-surface/lib-import-control-flow-extraction.spec.md` (Migration Path Step 1, Behavioral Contract behaviors 1-4, Acceptance Criteria)
- `lib/cli/state.mjs` (signature read — confirm `events` subcommand + `--event <type>` flag exist)
- `lib/cli/report.mjs` (signature read — confirm `--type plan-task` accepts `pending` / `in_progress` / `done` / `blocked` / `skipped`)
- `.context-index/constitution.md:68` (the anti-pattern this migration enforces)

**Audit:**
- Confirm `adev state current --spec <p>` returns `state.planTasks` (it does — `lib/cli/state.mjs::handleCurrent`).
- Confirm `adev state events --spec <p> --event <type>` exists with event-type filtering (it does — `lib/cli/state.mjs:74` `events` branch + `--event <type>` flag parsed at line 274 and used as the equality predicate via `filterEvents`).
- Confirm `adev report --type plan-task --status <s>` accepts `pending` / `in_progress` / `done` / `blocked` / `skipped` (it does — `lib/cli/report.mjs:245` `--type plan-task` branch validates the status against the canonical set used by `reportPlanTask`).
- Record findings inline in this task's commit message (Acceptance Criterion 7).
- Confirm no new CLI verbs are required — only the three already-shipped verbs (`state current`, `state events`, `report --type plan-task`) are used by the migration (Invariants: "No new CLI verbs").

- [ ] **Write failing test**

```javascript
// tests/lib-import-control-flow-extraction.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PLAN_SKILL = readFileSync("skills/plan/SKILL.md", "utf8");
const IMPL_SKILL = readFileSync("skills/implement/SKILL.md", "utf8");

// Acceptance Criterion 1 — the named-import shape must be gone from both files.
const FORBIDDEN_IMPORT = /import \{ (currentState|reportPlanTask|filterEvents)(, (currentState|reportPlanTask|filterEvents))* \} from '<ADEV_ROOT>\/lib\/lifecycle-state\.mjs'/;

test("plan/SKILL.md has no lib-import control-flow shape", () => {
  assert.equal(FORBIDDEN_IMPORT.test(PLAN_SKILL), false,
    "plan/SKILL.md still imports currentState/reportPlanTask/filterEvents in a fenced JS block");
});

test("implement/SKILL.md has no lib-import control-flow shape", () => {
  assert.equal(FORBIDDEN_IMPORT.test(IMPL_SKILL), false,
    "implement/SKILL.md still imports currentState/reportPlanTask in a fenced JS block");
});

// Behaviors 2, 3, 4 — the migrated verb invocations must be present.

test("plan/SKILL.md Step 7 references adev state events --event plan_task", () => {
  assert.match(PLAN_SKILL, /adev state events[^\n]*--event plan_task/,
    "plan/SKILL.md Step 7 must invoke `adev state events --event plan_task` for re-plan detection");
});

test("plan/SKILL.md Step 7 references adev report --type plan-task --status pending", () => {
  assert.match(PLAN_SKILL, /adev report[^\n]*--type plan-task[^\n]*--status pending/,
    "plan/SKILL.md Step 7 must invoke `adev report --type plan-task --status pending` once per task");
});

test("implement/SKILL.md Task Discovery references adev state current", () => {
  assert.match(IMPL_SKILL, /adev state current[^\n]*--spec/,
    "implement/SKILL.md Task Discovery must invoke `adev state current --spec <p>`");
});

test("implement/SKILL.md references all four plan-task transition statuses", () => {
  for (const status of ["in_progress", "done", "blocked", "skipped"]) {
    const re = new RegExp(`adev report[^\\n]*--type plan-task[^\\n]*--status ${status}`);
    assert.match(IMPL_SKILL, re,
      `implement/SKILL.md must invoke \`adev report --type plan-task --status ${status}\``);
  }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib-import-control-flow-extraction.test.mjs`
Expected: FAIL — all six assertions fail because the import lines are still present at `plan/SKILL.md:681` and `implement/SKILL.md:109`, and the `adev state current` / `adev state events --event plan_task` / `adev report --type plan-task --status <s>` invocations are not yet present in the relevant SKILL.md sections.

- [ ] **Implement**

This task does NOT migrate the SKILL.md files yet — that happens in Tasks 2-4. Task 1's "implement" step is only the test creation above. The test stays RED until Task 4 lands, at which point all six assertions pass simultaneously.

- [ ] **Verify test fails (still)**

Run: `node --test tests/lib-import-control-flow-extraction.test.mjs`
Expected: FAIL (unchanged) — Task 1 produces the test in RED state. The test transitions to GREEN incrementally as Tasks 2-4 land their migrations; Task 4 is the one that finally satisfies all assertions.

- [ ] **Commit**

Branch: `feat/cli-driver-surface/lib-import-control-flow-extraction`

```bash
git add tests/lib-import-control-flow-extraction.test.mjs
git commit -m "test(cli-driver-surface): add migration assertions for lib-import control-flow extraction

Audit findings (no new CLI verbs required):
- adev state current returns state.planTasks (lib/cli/state.mjs::handleCurrent) — covers Category A.
- adev state events --event <type> exists and filters via filterEvents (lib/cli/state.mjs:74, :274) — covers Category C read.
- adev report --type plan-task --status <s> accepts pending / in_progress / done / blocked / skipped (lib/cli/report.mjs:245) — covers Categories B + C write.

Spec: .context-index/specs/features/cli-driver-surface/lib-import-control-flow-extraction.spec.md
Plan-task: 1"
```

Also, at the end of Task 1, update the charter Capability Map:
- `charter.md` row "Lib-import control-flow extraction" — set `Status` from `review-passed` to `implementing`.

---

## Task 2: Migrate plan/SKILL.md Category C (re-plan detection + pending-event emission) [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Replacement prose and CLI invocations are fully drafted in the plan; single file edit at a fixed line range with existing verb surface.

**Charter capability:** Lib-import control-flow extraction
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `skills/plan/SKILL.md:680-701` (the fenced JS block in Step 7 Execution Handoff)

**Tests:** `tests/lib-import-control-flow-extraction.test.mjs` (created in Task 1; this task flips two assertions GREEN — `plan/SKILL.md has no lib-import control-flow shape`, `plan/SKILL.md Step 7 references adev state events --event plan_task`, `plan/SKILL.md Step 7 references adev report --type plan-task --status pending`).

**Context to load:**
- Spec: Current State Category C, Behavior 2, Acceptance Criterion 2
- Source file: `skills/plan/SKILL.md` lines 670-720 (preserve surrounding prose, only replace the fenced JS block at 680-701)
- Audit findings from Task 1 commit message

- [ ] **Write failing test**

Test already exists (created in Task 1). This step is a no-op for Task 2; the existing test asserts both the absence of the import shape AND the presence of the migrated verb invocations.

- [ ] **Verify test fails**

Run: `node --test tests/lib-import-control-flow-extraction.test.mjs`
Expected: FAIL — the import line at `plan/SKILL.md:681` still exists; the `adev state events --event plan_task` and `adev report --type plan-task --status pending` invocations are still missing from `plan/SKILL.md` Step 7.

- [ ] **Implement**

Replace the fenced JavaScript block in `skills/plan/SKILL.md` Step 7 (currently lines 680-701) with prose + CLI invocations. Preserve the surrounding step prose at lines 674-678 and 703-720 unchanged.

The replacement prose + verb invocations (descriptive shape):

````markdown
**Re-plan detection.** Before emitting new `pending` events, read the existing `plan_task` events for this spec. If any prior `plan_task` events reference this same plan file, print a one-line advisory — existing events remain as history (append-only).

```bash
adev state events --spec <spec-path> --event plan_task
```

If the returned event list is non-empty AND any event's `plan` field equals the current plan file path, emit the advisory:

> Re-plan detected: prior plan_task events remain in the lifecycle log as history. New events will append.

**Emit one `pending` event per task** in the plan's Task Map. The `--task-id` is the integer task number; `--notes` is omitted (null).

```bash
adev report --type plan-task --spec <spec-path> --plan <plan-file-path> --task-id <id> --status pending
```

Repeat for every task in the plan. The CLI verb encapsulates the `for`-loop semantics — the skill prose names the operation, the verb implements it.
````

Crucially, **no fenced ```javascript block** containing `filterEvents` / `for (const task of plan.tasks)` / `reportPlanTask` survives in `plan/SKILL.md` after this edit. The constitution's descriptive-vs-executive boundary (line 68) is honored.

- [ ] **Verify test passes (partial)**

Run: `node --test tests/lib-import-control-flow-extraction.test.mjs`
Expected: PASS for the three `plan/SKILL.md` assertions; still FAIL for the four `implement/SKILL.md` assertions (Tasks 3 + 4 migrate those).

- [ ] **Commit**

```bash
git add skills/plan/SKILL.md
git commit -m "refactor(skills/plan): migrate Step 7 re-plan-detection + pending emission to CLI verbs

Replaces the fenced JavaScript block at plan/SKILL.md:680-701 with prose +
adev state events --event plan_task (read) and adev report --type plan-task
--status pending (write, once per task). No new verbs introduced.

Spec: .context-index/specs/features/cli-driver-surface/lib-import-control-flow-extraction.spec.md
Plan-task: 2"
```

---

## Task 3: Migrate implement/SKILL.md Category A (task-selection lookup) [specialist: none]

**Routing:** auto-agent (score: 18/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=4
**Rationale:** Replacement prose for the Array.find block is fully provided; single file edit at a fixed line range; mirrors Task 2's migration pattern.

**Charter capability:** Lib-import control-flow extraction
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `skills/implement/SKILL.md:108-123` (the fenced `Array.find` block in Task Discovery)

**Tests:** `tests/lib-import-control-flow-extraction.test.mjs` (this task flips one assertion GREEN — `implement/SKILL.md Task Discovery references adev state current`).

**Context to load:**
- Spec: Current State Category A, Behavior 3, Acceptance Criterion 2
- Source file: `skills/implement/SKILL.md` lines 100-130 (preserve surrounding prose, only replace the fenced JS block at 108-123)
- Audit findings from Task 1 commit message — confirmation that `adev state current` returns full `state.planTasks` projection

- [ ] **Write failing test**

Test already exists (created in Task 1). Asserts that `adev state current --spec` is present in `implement/SKILL.md`.

- [ ] **Verify test fails**

Run: `node --test tests/lib-import-control-flow-extraction.test.mjs --test-name-pattern "Task Discovery"`
Expected: FAIL — the import line at `implement/SKILL.md:109` is still present; the migrated verb invocation is missing.

- [ ] **Implement**

Replace the fenced JavaScript block at `skills/implement/SKILL.md` lines 108-123 with prose + `adev state current` invocation. Preserve the surrounding step prose at lines 104-107 and 125-128 unchanged.

The replacement (descriptive shape):

````markdown
The plan file is the source of truth for *what the tasks are*. The lifecycle log projection is the source of truth for *what state each task is in*. Read the projection with:

```bash
adev state current --spec <spec-path>
```

The verb returns a `StateProjection` whose `planTasks` field maps `task_id` → `{ status, notes, plan, updated }`. The agent picks the next task to dispatch by scanning the plan's task list and selecting the first task whose `planTasks[task_id].status` is `pending`, `in_progress`, or is absent from the projection. (Absence means the task was authored before this surface was migrated — treat it as `pending` for the cap-of-one fallback.)

This is a one-line operator-cognitive lookup over a returned projection, not a control-flow JS block; the cap-of-one fallback is preserved here as prose so a reviewer can audit the intent without reading the CLI source.
````

After this edit, `implement/SKILL.md` no longer contains the `import { currentState, reportPlanTask } from '<ADEV_ROOT>...'` line for the task-discovery section.

**Note:** the `reportPlanTask` import name still appears in Task 4's region (transitions). Task 3's edit only removes the Task Discovery fenced block; Task 4's edit removes the four transition fenced blocks. The full Acceptance Criterion 1 (zero matches across both files) only becomes GREEN after Task 4 lands.

- [ ] **Verify test passes (partial)**

Run: `node --test tests/lib-import-control-flow-extraction.test.mjs`
Expected: PASS for `implement/SKILL.md Task Discovery references adev state current`; still FAIL for the four-transitions assertion and the no-import-shape assertion (Task 4 migrates those).

- [ ] **Commit**

```bash
git add skills/implement/SKILL.md
git commit -m "refactor(skills/implement): migrate Task Discovery lookup to adev state current

Replaces the fenced Array.find block at implement/SKILL.md:108-123 with prose
+ adev state current --spec <p>. The cap-of-one fallback (treat missing
projection entries as pending) is preserved as inline prose. No new verbs.

Spec: .context-index/specs/features/cli-driver-surface/lib-import-control-flow-extraction.spec.md
Plan-task: 3"
```

---

## Task 4: Migrate implement/SKILL.md Category B (four status-transition snippets) [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=5 pattern=4 blast=4 novelty=4
**Rationale:** All four transition replacements are spelled out in the plan; touches two files (SKILL.md plus charter Capability Map) but both edits are mechanical and well-bounded.

**Charter capability:** Lib-import control-flow extraction
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3 (same file; sequential to avoid merge conflict)
**Files:**
- Modify: `skills/implement/SKILL.md:125-155` (the four `reportPlanTask({...})` blocks in Task Transitions)
- Modify: `.context-index/specs/features/cli-driver-surface/charter.md` Capability Map row — advance `Status` from `implementing` to `implemented`

**Tests:** `tests/lib-import-control-flow-extraction.test.mjs` (this task flips the four-status assertion GREEN and the no-import-shape assertion for `implement/SKILL.md` GREEN — all six assertions PASS).

**Context to load:**
- Spec: Current State Category B, Behavior 4, Acceptance Criterion 2
- Source file: `skills/implement/SKILL.md` lines 125-160 (preserve surrounding prose, only replace the four fenced JS blocks at 129-151)
- Audit findings from Task 1 commit message — confirmation that `adev report --type plan-task --status <s>` accepts all four statuses
- Cross-cutting reference: `plan-task-events.spec.md` (transition semantics — cite, do not re-derive)
- Spec Error Case 2 — preserve the ≤200-char + no-stack-traces blocker `notes` guidance as inline prose

- [ ] **Write failing test**

Test already exists (created in Task 1). Asserts that all four `--status <s>` invocations are present and that no `import ... lifecycle-state.mjs` line survives in `implement/SKILL.md`.

- [ ] **Verify test fails**

Run: `node --test tests/lib-import-control-flow-extraction.test.mjs`
Expected: FAIL — the four fenced `reportPlanTask({...})` blocks at lines 129-151 still exist and the four `adev report --type plan-task --status <s>` invocations are not yet present.

- [ ] **Implement**

Replace the four fenced JavaScript blocks at `skills/implement/SKILL.md` lines 129-151 with one prose line + one verb invocation per transition. Preserve the surrounding step prose at lines 125-128 and the blocker-notes guidance at line 153 unchanged. Replace the existing JS comment markers (`// At task start ...` etc.) with prose.

The replacement (descriptive shape, one block per transition):

````markdown
All state transitions go through `adev report --type plan-task`. The plan file is read-only after authoring — no checkbox flips, no inline state stamps, no per-task Issue updates.

**At task start** (before dispatching the implementer subagent):

```bash
adev report --type plan-task --spec <spec-path> --plan <plan-file-path> --task-id <id> --status in_progress
```

**At task done** (after GREEN + REFACTOR + both reviews pass; `--notes` is an optional ≤200-char summary):

```bash
adev report --type plan-task --spec <spec-path> --plan <plan-file-path> --task-id <id> --status done [--notes "<≤200-char summary>"]
```

**On a blocker the skill cannot resolve** (the `--notes` field is a short operator-facing summary — no stack traces, no env values, no secrets, no full command output; full diagnostics belong in `.context-index/hygiene/blockers/`, not in the lifecycle log):

```bash
adev report --type plan-task --spec <spec-path> --plan <plan-file-path> --task-id <id> --status blocked --notes "<≤200-char operator-facing summary>"
```

**On a user-declined optional task** (e.g., user skips a REFACTOR-only task):

```bash
adev report --type plan-task --spec <spec-path> --plan <plan-file-path> --task-id <id> --status skipped
```
````

After this edit, `implement/SKILL.md` contains zero fenced ```javascript blocks for plan-task transitions, and the `import { currentState, reportPlanTask } from '<ADEV_ROOT>...'` line is fully gone (it was removed in two pieces: the `currentState` reference left when Task 3 deleted the Task Discovery block; the `reportPlanTask` reference now also gone because the four transition blocks no longer contain it).

**Charter Capability Map update (same commit):**
- `.context-index/specs/features/cli-driver-surface/charter.md` — set the "Lib-import control-flow extraction" row's `Status` column to `implemented`.

- [ ] **Verify test passes**

Run: `node --test tests/lib-import-control-flow-extraction.test.mjs`
Expected: PASS — all six assertions pass.

Run: `npm test`
Expected: PASS — full suite green, including `tests/skills-no-inline-node.test.mjs` (unchanged; allowlist still empty).

- [ ] **Commit**

```bash
git add skills/implement/SKILL.md .context-index/specs/features/cli-driver-surface/charter.md
git commit -m "refactor(skills/implement): migrate four plan-task transitions to adev report

Replaces the four fenced reportPlanTask({...}) blocks at implement/SKILL.md:
129-151 with prose + adev report --type plan-task --status <s> per
transition (in_progress / done / blocked / skipped). The ≤200-char
no-stack-trace blocker notes guidance is preserved as inline prose
(spec Error Case 2). No new verbs introduced — all four statuses are
already accepted by lib/cli/report.mjs:245.

Charter Capability Map advanced: Lib-import control-flow extraction
status review-passed → implementing (Task 1) → implemented (this commit).

Spec: .context-index/specs/features/cli-driver-surface/lib-import-control-flow-extraction.spec.md
Plan-task: 4"
```

---

## Quality Gates

After all four tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test` (must include the new `tests/lib-import-control-flow-extraction.test.mjs` and the pre-existing `tests/skills-no-inline-node.test.mjs`)
- All acceptance criteria from spec satisfied:
  - AC 1: `grep -nE "import \{ (currentState|reportPlanTask|filterEvents) \} from '<ADEV_ROOT>" skills/plan/SKILL.md skills/implement/SKILL.md` returns zero matches.
  - AC 2: The four sites in Current State are each replaced by prose + CLI invocation.
  - AC 3: `tests/skills-no-inline-node.test.mjs` continues to pass.
  - AC 4: `npm test` reports zero failures.
  - AC 5: No new CLI verbs introduced (audit-confirmed in Task 1 commit; only verb-argument extensions would have required a separate PR — none were needed).
  - AC 6: Charter Capability Map's "Lib-import control-flow extraction" row has `Status` advanced to `implemented`.
  - AC 7: Step 1 audit findings recorded in Task 1 commit message; "no new CLI verbs were silently introduced" is explicit.

No `governance/gates.yaml` exists in this project; the constitution-derived gate (`npm test`) is the only gate.
