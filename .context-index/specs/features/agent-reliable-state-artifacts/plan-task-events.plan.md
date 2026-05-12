# Implementation Plan: Plan-Task Events in Lifecycle Log

> **Methodology:** adev
> **Charter:** .context-index/specs/features/agent-reliable-state-artifacts/charter.md
> **Spec:** .context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-12)
> **Platform:** JavaScript (ESM, `.mjs`), Node.js, `node:test`

**Goal:** Switch `/adev:plan` and `/adev:implement` off the legacy per-task-issue + plan-checkbox channels and onto `reportPlanTask` events in the lifecycle log, with the plan markdown frozen as an immutable input after authoring.

**Architecture:** All write/read for per-task state moves through `lib/lifecycle-state.mjs` (already validated). `/adev:plan` emits one `pending` event per task at authoring time; `/adev:implement` transitions tasks via `in_progress` → `done`/`blocked`/`skipped`. The plan markdown file is never edited by these skills again. An architectural test enforces plan-file immutability, and the migration tool stamps a `DO NOT EDIT` advisory header on pre-existing plan files.

---

## File Structure

**Create:**
- `tests/skills/plan-task-immutability.test.mjs` — Architectural test asserting plan files are not mutated after their first `plan_task pending` event.
- `tests/skills/no-stale-format-refs.test.mjs` — Static gate that covers (a) `/adev:plan` does not create per-task Issues, (b) `/adev:implement` reads from `planTasks` projection (extended in Task 2), (c) `skills/plan/SKILL.md` carries the clarifying note + no plan template anywhere in the repo has a `Status` column header (extended in Task 3). This file is created here rather than reusing an existing file because `lifecycle-skill-instruction-updates.spec.md` Task 2 also creates this file — confirmed by the spec's "owned by `lifecycle-skill-instruction-updates`" comment; if that sibling plan lands first, this task EXTENDS the existing file instead of creating it.
- `lib/plan-immutability.mjs` — Detector module exporting `detectMutatedPlans(projectRoot)`. Used by Task 5's architectural test.
- `tests/fixtures/plan-immutability/violation/` — Small fixture project demonstrating a mutated plan file (Task 5).

**Modify:**
- `skills/plan/SKILL.md` — Add `reportPlanTask({status:"pending"})` loop after plan file is written; remove the per-task `getIssueManager().create(...)` block; add the re-plan advisory detection. The clarifying note about checkbox semantics is added separately by Task 3.
- `skills/plan/feature-mode.md` — Same instruction surface change scoped to feature mode.
- `skills/plan/epic-mode.md` — Same for epic mode.
- `skills/plan/release-mode.md` — Same for release mode.
- `skills/plan/milestone-mode.md` — Same for milestone mode.
- `skills/implement/SKILL.md` — Replace checkbox-mutation prose with `currentState(spec).planTasks` read for status; add `reportPlanTask` transitions at task start, done, blocked, skipped.
- `lib/migrate-state-artifacts.mjs` — Add a small step that stamps `<!-- DO NOT EDIT statuses inline — see lifecycle log <slug>.jsonl -->` as the first line of each pre-existing plan file under `.context-index/specs/`. Idempotent (skip if header already present).

**Reference (read, do not modify):**
- `.context-index/specs/features/agent-reliable-state-artifacts/lifecycle-event-log.spec.md` § Canonical Enums and Field Extensions — for the `plan_task.status` enum and `planTasks` projection shape.
- `lib/lifecycle-state.mjs` — `reportPlanTask`, `currentState`, `filterEvents` exported APIs (already shipped).
- `.context-index/samples/general-library-module-graph.md` — Module-graph pattern reference.

---

## Context Packets

### Task 1 Context (re-plan advisory + reportPlanTask emission in /adev:plan)
- Spec: `plan-task-events.spec.md` § `/adev:plan` Behavioral Changes (criteria 1, 2, 7 of AC)
- Foundation: `lifecycle-event-log.spec.md` § Behaviors (`filterEvents` + `reportPlanTask`)
- Current file: `skills/plan/SKILL.md` (full read)
- Mode files: `skills/plan/feature-mode.md`, `skills/plan/epic-mode.md`, `skills/plan/release-mode.md`, `skills/plan/milestone-mode.md` (signatures of each task-emission section)
- Charter: `agent-reliable-state-artifacts/charter.md` (capability: Plan-task events in lifecycle log)

### Task 2 Context (/adev:implement rewrite)
- Spec: § `/adev:implement` Behavioral Changes (criteria 3, 4 of AC)
- Foundation: `lifecycle-event-log.spec.md` § Canonical Enums (status enum + planTasks shape)
- Current file: `skills/implement/SKILL.md` (full read)
- Sibling spec: `lifecycle-skill-instruction-updates.spec.md` (for cross-reference boundary)

### Task 3 Context (plan-template column removal)
- Spec: § Plan Markdown Surface
- Current template: `templates/plan-template.md` (or whichever the skill uses)

### Task 4 Context (migration tool advisory header)
- Spec: § Migration / Backfill + Task Map "Migration-tool advisory header"
- Sibling spec: `one-shot-migration-tool.spec.md` (existing step ordering)
- Current file: `lib/migrate-state-artifacts.mjs` (full read for context)

### Task 5 Context (plan-file immutability test)
- Spec: § Acceptance Criteria bullet 5 + Task Map
- Foundation: `filterEvents` API for fetching the first `pending` event per task
- Sample: `tests/lib/lifecycle-state-arch.test.mjs` (existing architectural test pattern)

### Task 6 Context (no-per-task-issue static check)
- Spec: § Acceptance Criteria bullet 2 + Task Map row "Architectural test"
- Sibling spec: `issue-board-granularity-cleanup.spec.md` § Adapter Enforcement (the runtime defense; this is the static-prose defense)

### Task 7 Context (e2e integration test)
- Spec: § Acceptance Criteria all bullets
- Sample: `tests/helpers.mjs` (`createTempDir`, `writeFixture`)
- Foundation: `tests/lib/lifecycle-state.test.mjs` (existing test patterns)

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 (all share `tests/skills/no-stale-format-refs.test.mjs`; Task 1 creates the file, Tasks 2 and 3 extend it)
- Group B (independent): Task 4 (migration tool — distinct files; no shared test file)
- Group C (sequential, last): Task 5 (creates `lib/plan-immutability.mjs` + a separate test file — no overlap with Group A, but conceptually validates Task 1's behavior so it lands after)

Groups A and B can run in parallel; Group C runs last.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | `/adev:plan` SKILL.md + mode files: emit `reportPlanTask` pending, drop per-task issue creation; create static-check test | medium | unit | — | 5 modify, 1 create |
| 2 | `/adev:implement` SKILL.md: read status from `planTasks` projection, emit transition events | medium | unit | Task 1 | 1 modify, 1 modify (test) |
| 3 | `skills/plan/SKILL.md`: add clarifying note about checkbox semantics + audit that no plan template has a `Status` column | small | unit | Task 1 | 1 modify, 1 modify (test) |
| 4 | Migration tool: stamp DO-NOT-EDIT advisory header on legacy plan files | small | unit | — | 1 modify, 1 modify (test) |
| 5 | Architectural test: plan files immutable after first `pending` event; detector in `lib/plan-immutability.mjs` | medium | unit | Task 1 | 1 create (lib), 1 create (test), 1 create (fixture) |

---

## Strategy Summary

All 5 tasks resolve to `unit` (source: fallback). No `infra_requirements:` declared in the spec; every test operates on temp directories or repo files.

---

## Tasks

### Task 1: `/adev:plan` emits `reportPlanTask` events; drops per-task issue creation [specialist: none]

**Charter capability:** Plan-task events in lifecycle log
**Strategy:** unit (source: fallback)
**Files:**
- Modify: `skills/plan/SKILL.md`, `skills/plan/feature-mode.md`, `skills/plan/epic-mode.md`, `skills/plan/release-mode.md`, `skills/plan/milestone-mode.md`
- Test: `tests/skills/no-stale-format-refs.test.mjs` extension (asserts no `getIssueManager().create({...planTask})` prose in plan skill files)

**Tests:** `tests/skills/no-stale-format-refs.test.mjs` (extend existing patterns; if not yet on disk, this task creates the file).

**Context to load:**
- Spec § `/adev:plan` Behavioral Changes
- `lifecycle-event-log.spec.md` § Canonical Enums and Field Extensions

- [ ] **Write failing test**

Add a case to (or create) `tests/skills/no-stale-format-refs.test.mjs`:

```js
import { readFileSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

test('no-stale-format-refs / /adev:plan does not create per-task issues', async () => {
  const files = ['skills/plan/SKILL.md', 'skills/plan/feature-mode.md',
                 'skills/plan/epic-mode.md', 'skills/plan/release-mode.md',
                 'skills/plan/milestone-mode.md'];
  for (const f of files) {
    const content = readFileSync(f, 'utf8');
    assert.ok(!/create\([^)]*planTask\s*:/.test(content),
              `${f} still references create({ ..., planTask: ... })`);
    assert.ok(/reportPlanTask/.test(content),
              `${f} does not reference reportPlanTask`);
  }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/no-stale-format-refs.test.mjs`
Expected: FAIL — the plan skill files still contain `create({...planTask:...})` patterns and/or lack `reportPlanTask` references.

- [ ] **Implement**

Rewrite each plan skill file's "task emission" section. The canonical block to insert after the plan file is written:

```markdown
### Emit plan-task pending events

After the plan file is saved, walk the Task Map and emit one `pending` event per task into the spec's lifecycle log:

```js
import { reportPlanTask, filterEvents } from '<ADEV_ROOT>/lib/lifecycle-state.mjs';

const priorPending = filterEvents(projectRoot, specPath,
  e => e.event === 'plan_task' && e.plan === planFilePath);
if (priorPending.length > 0) {
  console.warn('Re-plan detected: prior plan_task events remain in the lifecycle log as history. New events will append.');
}

for (const task of plan.tasks) {
  reportPlanTask(projectRoot, specPath, {
    plan: planFilePath,
    task_id: task.id,
    status: 'pending',
    notes: null,
  });
}
```

Per-task `getIssueManager().create(...)` calls are removed. Feature- and Epic-level Issue creation in `--feature` and `--epic` modes is unchanged — those are board-granularity items.
```

Remove the old block that emitted one Issue per plan task.

- [ ] **Verify test passes**

Run: `node --test tests/skills/no-stale-format-refs.test.mjs`
Expected: PASS.

- [ ] **Commit**

Branch: `feat/agent-reliable-state-artifacts/plan-task-emit`

```bash
git add skills/plan/SKILL.md skills/plan/feature-mode.md skills/plan/epic-mode.md skills/plan/release-mode.md skills/plan/milestone-mode.md tests/skills/no-stale-format-refs.test.mjs
git commit -m "$(cat <<'EOF'
feat(agent-reliable-state-artifacts): /adev:plan emits reportPlanTask events

Replaces per-task Issue creation with reportPlanTask pending events; adds re-plan
detection advisory. Plan markdown is no longer mutated by /adev:plan.

Spec: .context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md
Plan-task: 1
EOF
)"
```

---

### Task 2: `/adev:implement` reads status from `planTasks`; emits transition events [specialist: none]

**Charter capability:** Plan-task events in lifecycle log
**Strategy:** unit (source: fallback)
**Files:**
- Modify: `skills/implement/SKILL.md`
- Test: `tests/skills/no-stale-format-refs.test.mjs`

**Tests:** `tests/skills/no-stale-format-refs.test.mjs` (extended).

**Context to load:**
- Spec § `/adev:implement` Behavioral Changes
- `lifecycle-event-log.spec.md` § Canonical Enums (status enum)

- [ ] **Write failing test**

Extend `tests/skills/no-stale-format-refs.test.mjs`:

```js
test('no-stale-format-refs / /adev:implement reads from planTasks projection', () => {
  const content = readFileSync('skills/implement/SKILL.md', 'utf8');
  assert.ok(!/check the box|update the issue for this task|tick the checkbox/i.test(content),
            'plan-checkbox mutation prose still present in /adev:implement');
  assert.ok(/currentState\([^)]*\)\.planTasks/.test(content),
            '/adev:implement does not read currentState(...).planTasks');
  assert.ok(/reportPlanTask\([^)]*'in_progress'/.test(content) ||
            /reportPlanTask\([^)]*status:\s*['"]in_progress/.test(content),
            '/adev:implement does not emit reportPlanTask in_progress transitions');
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/no-stale-format-refs.test.mjs`
Expected: FAIL — implement skill still references checkbox mutation or lacks the new references.

- [ ] **Implement**

Edit `skills/implement/SKILL.md`. Remove every instruction that tells the agent to update a plan checkbox or update a per-task Issue. Add the new task-discovery + transition block:

```markdown
### Task discovery and state

The plan file is the source of truth for *what the tasks are*. The lifecycle log
projection is the source of truth for *what state each task is in*.

```js
import { currentState } from '<ADEV_ROOT>/lib/lifecycle-state.mjs';
import { reportPlanTask } from '<ADEV_ROOT>/lib/lifecycle-state.mjs';

const state = currentState(projectRoot, specPath);
// planTasks shape: { [task_id]: { status, notes, plan, updated } }
const nextTask = plan.tasks.find(t => state.planTasks[t.id]?.status === 'pending'
                                    || state.planTasks[t.id]?.status === 'in_progress');
```

### Task transitions

At task start:
  reportPlanTask(projectRoot, specPath, { plan, task_id, status: 'in_progress', notes: null });

At task done (after GREEN + REFACTOR):
  reportPlanTask(projectRoot, specPath, { plan, task_id, status: 'done', notes: '<1-line summary or null>' });

On blocker (skill cannot resolve):
  reportPlanTask(projectRoot, specPath, { plan, task_id, status: 'blocked', notes: '<≤200-char operator-facing summary>' });

On user-declined optional task:
  reportPlanTask(projectRoot, specPath, { plan, task_id, status: 'skipped', notes: null });

The plan file is read-only after authoring. No checkbox flips, no inline state stamps, no per-task Issue updates.
```

- [ ] **Verify test passes**

Run: `node --test tests/skills/no-stale-format-refs.test.mjs`
Expected: PASS.

- [ ] **Commit**

Branch: `feat/agent-reliable-state-artifacts/implement-plan-tasks`

```bash
git add skills/implement/SKILL.md tests/skills/no-stale-format-refs.test.mjs
git commit -m "$(cat <<'EOF'
feat(agent-reliable-state-artifacts): /adev:implement reads planTasks projection

Replaces plan-checkbox mutation with reportPlanTask transitions. Status reads
come from currentState(spec).planTasks; the plan file is treated as a read-only
input after authoring.

Spec: .context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md
Plan-task: 2
EOF
)"
```

---

### Task 3: `skills/plan/SKILL.md` — clarify checkbox semantics + audit no plan template has a Status column [specialist: none]

**Charter capability:** Plan-task events in lifecycle log
**Strategy:** unit (source: fallback)
**Files:**
- Modify: `skills/plan/SKILL.md` (note inserted near the per-task structure section at line ~440)
- Test: extends `tests/skills/no-stale-format-refs.test.mjs` (created by Task 1)

**Tests:** `tests/skills/no-stale-format-refs.test.mjs`.

**Depends on:** Task 1 (the test file).

**Context to load:**
- Spec § Plan Markdown Surface: requires "trailing `Status` column ... removed from new plans" for the plan stencil. Verification: today the stencil in `skills/plan/SKILL.md` (Task Summary table at ~L414 and Task Structure block at ~L460) has NO `Status` column — it uses per-task `- [ ]` checkboxes. So the spec requirement is **already satisfied vacuously** for new plans; this task adds an audit assertion to lock that in, plus the clarifying note about checkbox semantics.
- Current `skills/plan/SKILL.md` line 409–460 (Task Summary Table + Task Structure sections)

- [ ] **Write failing test**

Extend `tests/skills/no-stale-format-refs.test.mjs` with two new assertions:

```js
test('skills/plan/SKILL.md: clarifying note about lifecycle log status tracking', () => {
  const content = readFileSync('skills/plan/SKILL.md', 'utf8');
  assert.match(content,
               /(status .*lifecycle event log|checkboxes? are authoring guides only|not mutated by skills)/i,
               'skills/plan/SKILL.md missing the clarifying note about checkbox/status semantics');
});

test('no plan-template carries a Status column', async () => {
  // Audit every place a plan stencil could live: the canonical inline template in
  // skills/plan/SKILL.md, and any future templates under templates/ that match plan-template*.
  const candidatePaths = ['skills/plan/SKILL.md'];
  const { readdirSync } = await import('node:fs');
  try {
    for (const f of readdirSync('templates/')) {
      if (/^plan-template/.test(f)) candidatePaths.push(`templates/${f}`);
    }
  } catch { /* templates/ may not exist */ }
  for (const p of candidatePaths) {
    const content = readFileSync(p, 'utf8');
    // Look only at lines that introduce a plan-task table header (must contain # or Task column).
    const taskHeaderLines = content.split('\n')
      .filter(l => /^\|.*\|.*\|/.test(l) && /\b(#|Title)\b.*\|.*\b(Complexity|Files|Estimated)/.test(l));
    for (const header of taskHeaderLines) {
      assert.ok(!/\|\s*Status\s*\|/i.test(header),
                `${p}: plan-task table header still contains a Status column: ${header}`);
    }
  }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/no-stale-format-refs.test.mjs`
Expected: FAIL on the first new assertion (clarifying note not yet present). The second assertion (no `Status` column) passes today and stays green — it's a regression guard.

- [ ] **Implement**

In `skills/plan/SKILL.md`, near the Task Structure section (around the line that documents the `- [ ] **Write failing test**` checkbox pattern), insert this single-paragraph note:

```markdown
> **Note on task status.** The per-task `- [ ]` checkboxes are authoring guides for human reviewers — they are not mutated by `/adev:plan`, `/adev:implement`, or any other skill. Authoritative task state lives in the spec's lifecycle event log as `plan_task` events (see `plan-task-events.spec.md`). Read via `currentState(projectRoot, specPath).planTasks`. Plan-task tables MUST NOT include a `Status` column — status belongs in the lifecycle log.
```

The final sentence locks in the spec's "no Status column" requirement at the prose level, complementing the test-side guard.

- [ ] **Verify test passes**

Run: `node --test tests/skills/no-stale-format-refs.test.mjs`
Expected: PASS for both new assertions.

- [ ] **Commit**

Branch: `feat/agent-reliable-state-artifacts/plan-skill-checkbox-note`

```bash
git add skills/plan/SKILL.md tests/skills/no-stale-format-refs.test.mjs
git commit -m "$(cat <<'EOF'
feat(agent-reliable-state-artifacts): clarify plan-task checkboxes are authoring guides

skills/plan/SKILL.md now explicitly notes that per-task checkboxes are not
mutated by skills; task status lives in the lifecycle event log. Test asserts
the note is present.

Spec: .context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md
Plan-task: 3
EOF
)"
```

---

### Task 4: Migration tool stamps DO-NOT-EDIT advisory on legacy plan files [specialist: none]

**Charter capability:** Plan-task events in lifecycle log
**Strategy:** unit (source: fallback)
**Files:**
- Modify: `lib/migrate-state-artifacts.mjs`
- Test: `tests/lib/migrate-state-artifacts.test.mjs` (extend)

**Tests:** `tests/lib/migrate-state-artifacts.test.mjs`.

**Context to load:**
- Spec § Migration / Backfill
- `one-shot-migration-tool.spec.md` (full read — to insert the step in the right place)

- [ ] **Write failing test**

Add a case to `tests/lib/migrate-state-artifacts.test.mjs`:

```js
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTempDir, cleanupTempDir } from '../helpers.mjs';
import { migrate } from '../../lib/migrate-state-artifacts.mjs';

test('migrate stamps DO-NOT-EDIT advisory on pre-existing plan files', async () => {
  const dir = createTempDir();
  const planPath = join(dir, '.context-index/specs/features/x/foo.plan.md');
  mkdirSync(join(dir, '.context-index/specs/features/x'), { recursive: true });
  writeFileSync(planPath, '# Implementation Plan: Foo\n\n## Tasks\n');
  await migrate({ projectRoot: dir });
  const content = readFileSync(planPath, 'utf8');
  assert.match(content, /^<!-- DO NOT EDIT statuses inline — see lifecycle log foo\.jsonl -->/);

  // Idempotent: re-run does not double-stamp.
  await migrate({ projectRoot: dir });
  const occurrences = (readFileSync(planPath, 'utf8').match(/DO NOT EDIT statuses inline/g) || []).length;
  assert.equal(occurrences, 1, 'header stamped more than once');
  cleanupTempDir(dir);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/migrate-state-artifacts.test.mjs`
Expected: FAIL — no header is currently stamped.

- [ ] **Implement**

Add a step to `lib/migrate-state-artifacts.mjs` ordered after the `tasks.md` → `tasks.json` step and before completion reporting. The step:
1. Globs `.context-index/specs/**/*.plan.md` under `projectRoot`.
2. For each plan file, reads the first 256 bytes; if they already start with `<!-- DO NOT EDIT statuses inline`, skip.
3. Otherwise, derives the slug from the sibling `<name>.spec.md` (or the plan filename) and stamps the exact header on a new first line: `<!-- DO NOT EDIT statuses inline — see lifecycle log <slug>.jsonl -->\n` followed by the original content.

The header string is a constant — no operator-name or absolute-path interpolation.

- [ ] **Verify test passes**

Run: `node --test tests/lib/migrate-state-artifacts.test.mjs`
Expected: PASS.

- [ ] **Commit**

Branch: `feat/agent-reliable-state-artifacts/migrate-plan-advisory-header`

```bash
git add lib/migrate-state-artifacts.mjs tests/lib/migrate-state-artifacts.test.mjs
git commit -m "$(cat <<'EOF'
feat(agent-reliable-state-artifacts): stamp DO-NOT-EDIT advisory on legacy plan files

Migration tool now stamps a single-line header on every pre-existing plan file
pointing operators at the lifecycle log. Idempotent; safe on re-run.

Spec: .context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md
Plan-task: 4
EOF
)"
```

---

### Task 5: Architectural test — plan files immutable after first `pending` event [specialist: none]

**Charter capability:** Plan-task events in lifecycle log
**Strategy:** unit (source: fallback)
**Files:**
- Create: `tests/skills/plan-task-immutability.test.mjs`
- Create (fixture): `tests/fixtures/plan-immutability/violation/` (small fixture with a plan file + sibling lifecycle log demonstrating a violation)

**Tests:** the file under create.

**Depends on:** Task 1 (needs the `pending` event emission to exist so the test has a fixture path).

**Context to load:**
- Spec § Acceptance Criteria bullet 5
- `tests/lib/lifecycle-state-arch.test.mjs` (pattern reference)

**Runtime note:** This task uses `node:fs/promises.glob` which is stable from Node 22+. Verify the project's minimum Node version supports it before landing (`engines.node` in `package.json`). If <22, substitute a recursive `readdirSync` walk in `lib/plan-immutability.mjs`.

- [ ] **Write failing test**

```js
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { glob } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { filterEvents } from '../../lib/lifecycle-state.mjs';

// Fixture-driven negative test (must fail BEFORE implementation lands):
test('plan-immutability: violation fixture is detected', async () => {
  const fixtureRoot = 'tests/fixtures/plan-immutability/violation';
  if (!existsSync(fixtureRoot)) {
    assert.fail('violation fixture missing — TDD RED state requires the fixture to be in tree');
  }
  // Detector function under test (implemented in this task):
  const { detectMutatedPlans } = await import('../../lib/plan-immutability.mjs');
  const violations = await detectMutatedPlans(fixtureRoot);
  assert.equal(violations.length, 1, 'expected exactly one violation in fixture');
  assert.match(violations[0].path, /foo\.plan\.md$/);
});

// Real-repo positive test (must pass after implementation):
test('plan-immutability: real repo has no violations', async () => {
  const { detectMutatedPlans } = await import('../../lib/plan-immutability.mjs');
  const violations = await detectMutatedPlans(process.cwd());
  assert.deepEqual(violations, [], `unexpected plan-file mutations:\n${JSON.stringify(violations, null, 2)}`);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/plan-task-immutability.test.mjs`
Expected: FAIL — `lib/plan-immutability.mjs` does not yet exist; both test cases fail with `Cannot find module`.

- [ ] **Implement**

1. Create the fixture at `tests/fixtures/plan-immutability/violation/`:
   - `.context-index/manifest.yaml` (minimal stub).
   - `.context-index/specs/features/x/foo.spec.md` (minimal spec).
   - `.context-index/specs/features/x/foo.plan.md` (a plan file whose last git commit timestamp is AFTER the `pending` event's `ts`).
   - `.context-index/lifecycle-state/foo.jsonl` (single line: `{"ts":"<earlier-ts>","event":"plan_task","plan":".context-index/specs/features/x/foo.plan.md","task_id":"t1","status":"pending"}`).

2. Create `lib/plan-immutability.mjs` exporting `detectMutatedPlans(projectRoot) → Promise<Array<{ path, firstPendingTs, lastCommitTs }>>`. Implementation:
   - Glob `.context-index/specs/**/*.plan.md` under `projectRoot` (use `node:fs/promises.glob`).
   - For each plan, derive sibling spec path. If sibling spec absent, skip.
   - Call `filterEvents(projectRoot, specPath, e => e.event === 'plan_task' && e.plan?.endsWith(planBasename))`.
   - Find the earliest `pending` event for that plan.
   - Run `git log --since="<earlier-ts>" --pretty=oneline -- "<plan-path>"`; if non-empty, push a violation record.

3. The real-repo case PASSES because the repo has no plan files with prior `pending` events that pre-date their last commit (yet — Task 1's emission will create that scenario going forward, and any future mutation would be caught).

- [ ] **Verify test passes**

Run: `node --test tests/skills/plan-task-immutability.test.mjs`
Expected: PASS — both fixture (1 violation detected) and real-repo (0 violations) cases green.

- [ ] **Commit**

Branch: `feat/agent-reliable-state-artifacts/plan-immutability-test`

```bash
git add tests/skills/plan-task-immutability.test.mjs tests/fixtures/plan-immutability/ lib/plan-immutability.mjs
git commit -m "$(cat <<'EOF'
test(agent-reliable-state-artifacts): plan files immutable after pending event

Architectural test asserts no commit modifies a plan file after the first
plan_task pending event for that plan. Fixture covers the violation case;
detector lives in lib/plan-immutability.mjs.

Spec: .context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.spec.md
Plan-task: 5
EOF
)"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in `.context-index/specs/features/agent-reliable-state-artifacts/plan-task-events.validate.md`, not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied (8 ACs):
  - AC 1 (`pending` event per task) → Task 1
  - AC 2 (no per-task Issue creation) → Task 1 (audit test embedded)
  - AC 3 (`/adev:implement` reads from `planTasks`) → Task 2
  - AC 4 (transition events at start/done/blocked/skipped) → Task 2
  - AC 5 (plan files immutable) → Task 5
  - AC 6 (re-plan is non-destructive) → Task 1 (advisory) + Task 5 (architectural defense)
  - AC 7 (migration tool advisory header) → Task 4
  - AC 8 (quality gates) → this section
- `tests/skills/no-stale-format-refs.test.mjs` is green
- `tests/skills/plan-task-immutability.test.mjs` is green
- `tests/lib/migrate-state-artifacts.test.mjs` is green (advisory-header stamping case)
- No constitutional violations introduced
