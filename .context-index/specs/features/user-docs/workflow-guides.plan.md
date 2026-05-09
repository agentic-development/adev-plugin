# Implementation Plan: Workflow Guides

> **Methodology:** adev
> **Charter:** .context-index/specs/features/user-docs/charter.md
> **Spec:** .context-index/specs/features/user-docs/workflow-guides.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-09)
> **Platform:** Node.js, JavaScript (ESM), npm

**Goal:** Create four lifecycle-phase workflow guides (design, build, validate-debug, maintain) that teach users how to use adev skills in context, organized by the phase of development they belong to.

**Architecture:** Pure markdown documentation files in `docs/`. No build step, no site generator, no external dependencies. Content is sourced from SKILL.md files in the adev-plugin for accuracy. Each guide covers what each skill does, when to use it, prerequisites, an example invocation, expected output, and links to the Skill Reference for full details. Phase transitions and gates are documented at the boundaries between guides.

**Review notes to address during implementation:**
- SA-2: Gate conditions should be sourced from hooks/hooks.json as authoritative source
- CON-4: Charter capability naming drift is advisory only — use filenames as canonical

---

## File Structure

**Create:**
- `docs/design-phase.md` — Brainstorm, specify, review-specs, prototype workflow guide
- `docs/build-phase.md` — Plan, route, implement, write-test, build workflow guide
- `docs/validate-debug.md` — Validate, debug, eval, recover workflow guide
- `docs/maintain.md` — Issues, status, hygiene, retro, codehealth, repomap, reconcile, sample workflow guide

**Modify:**
- `docs/README.md` — Update Workflow Guides section from "coming soon" to live links

**Reference (read, do not modify):**
- `skills/brainstorm/SKILL.md` — Source for design phase skill descriptions
- `skills/specify/SKILL.md` — Source for design phase skill descriptions
- `skills/review-specs/SKILL.md` — Source for design phase skill descriptions
- `skills/prototype/SKILL.md` — Source for design phase skill descriptions
- `skills/plan/SKILL.md` — Source for build phase skill descriptions
- `skills/route/SKILL.md` — Source for build phase skill descriptions
- `skills/implement/SKILL.md` — Source for build phase skill descriptions
- `skills/write-test/SKILL.md` — Source for build phase skill descriptions
- `skills/build/SKILL.md` — Source for build phase skill descriptions
- `skills/validate/SKILL.md` — Source for validate phase skill descriptions
- `skills/debug/SKILL.md` — Source for validate phase skill descriptions
- `skills/eval/SKILL.md` — Source for validate phase skill descriptions
- `skills/recover/SKILL.md` — Source for validate phase skill descriptions
- `skills/issues/SKILL.md` — Source for maintain phase skill descriptions
- `skills/status/SKILL.md` — Source for maintain phase skill descriptions
- `skills/hygiene/SKILL.md` — Source for maintain phase skill descriptions
- `skills/retro/SKILL.md` — Source for maintain phase skill descriptions
- `skills/codehealth/SKILL.md` — Source for maintain phase skill descriptions
- `skills/repomap/SKILL.md` — Source for maintain phase skill descriptions
- `skills/reconcile/SKILL.md` — Source for maintain phase skill descriptions
- `skills/sample/SKILL.md` — Source for maintain phase skill descriptions
- `.context-index/specs/features/user-docs/workflow-guides.spec.md` — Behavioral contract
- `.context-index/specs/features/user-docs/charter.md` — Feature charter

## Context Packets

### Task 1 Context
- Spec behaviors: 1, 5, 6, 8
- Charter capability: Design Phase Guide
- Source: `skills/brainstorm/SKILL.md`, `skills/specify/SKILL.md`, `skills/review-specs/SKILL.md`, `skills/prototype/SKILL.md`
- Gate transition: design-to-build requires review-passed verdict

### Task 2 Context
- Spec behaviors: 2, 5, 6, 8
- Charter capability: Build Phase Guide
- Source: `skills/plan/SKILL.md`, `skills/route/SKILL.md`, `skills/implement/SKILL.md`, `skills/write-test/SKILL.md`, `skills/build/SKILL.md`
- Gate transition: build-to-validate requires implementation complete and tests passing

### Task 3 Context
- Spec behaviors: 3, 5, 6
- Charter capability: Validate & Debug Guide
- Source: `skills/validate/SKILL.md`, `skills/debug/SKILL.md`, `skills/eval/SKILL.md`, `skills/recover/SKILL.md`

### Task 4 Context
- Spec behaviors: 4, 5, 6
- Charter capability: Maintain Phase Guide
- Source: `skills/issues/SKILL.md`, `skills/status/SKILL.md`, `skills/hygiene/SKILL.md`, `skills/retro/SKILL.md`, `skills/codehealth/SKILL.md`, `skills/repomap/SKILL.md`, `skills/reconcile/SKILL.md`, `skills/sample/SKILL.md`

### Task 5 Context
- Spec behaviors: 7 (reading order), postcondition (all four linked from TOC)
- Reference: `docs/README.md`, all four guide files from Tasks 1-4

## Parallelization

- Group A (independent): Task 1 (design-phase.md — no file dependencies on other tasks)
- Group B (independent): Task 2 (build-phase.md — no file dependencies on other tasks)
- Group C (independent): Task 3 (validate-debug.md — no file dependencies on other tasks)
- Group D (independent): Task 4 (maintain.md — no file dependencies on other tasks)
- Group E (sequential, after all): Task 5 (link verification and TOC update — depends on all guide files existing)

Tasks 1-4 can all run in parallel. Task 5 runs last.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Write docs/design-phase.md — Design Phase Guide | large | unit | — | 1 create |
| 2 | Write docs/build-phase.md — Build Phase Guide | large | unit | — | 1 create |
| 3 | Write docs/validate-debug.md — Validate & Debug Guide | medium | unit | — | 1 create |
| 4 | Write docs/maintain.md — Maintain Phase Guide | large | unit | — | 1 create |
| 5 | Update TOC links and verify cross-page links | small | unit | Task 1, 2, 3, 4 | 5 modify |

---

### Task 1: Write docs/design-phase.md — Design Phase Guide [specialist: none]

**Charter capability:** Design Phase Guide
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `docs/design-phase.md`
- Modify: `tests/docs/workflow-guides.test.mjs`

**Tests:** `tests/docs/workflow-guides.test.mjs`

- [x] **Write failing test**

```javascript
import { describe, it } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert';

const DOCS_DIR = join(import.meta.dirname, '..', '..', 'docs');

describe('docs/design-phase.md — Design Phase Guide', () => {
  it('should exist', () => {
    assert.ok(existsSync(join(DOCS_DIR, 'design-phase.md')));
  });

  it('should cover brainstorm skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'design-phase.md'), 'utf-8');
    assert.ok(content.includes('brainstorm') || content.includes('Brainstorm'), 'Missing brainstorm skill');
    assert.ok(content.includes('/adev:brainstorm'), 'Missing /adev:brainstorm invocation');
  });

  it('should cover specify skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'design-phase.md'), 'utf-8');
    assert.ok(content.includes('specify') || content.includes('Specify'), 'Missing specify skill');
    assert.ok(content.includes('/adev:specify'), 'Missing /adev:specify invocation');
  });

  it('should cover review-specs skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'design-phase.md'), 'utf-8');
    assert.ok(content.includes('review-specs') || content.includes('Review'), 'Missing review-specs skill');
    assert.ok(content.includes('/adev:review-specs'), 'Missing /adev:review-specs invocation');
  });

  it('should cover prototype skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'design-phase.md'), 'utf-8');
    assert.ok(content.includes('prototype') || content.includes('Prototype'), 'Missing prototype skill');
    assert.ok(content.includes('/adev:prototype'), 'Missing /adev:prototype invocation');
  });

  it('should include skill descriptions with what, when, and prerequisites', () => {
    const content = readFileSync(join(DOCS_DIR, 'design-phase.md'), 'utf-8');
    // Each skill section should have purpose and usage context
    assert.ok(content.includes('when') || content.includes('When'), 'Missing when-to-use guidance');
  });

  it('should document the design-to-build gate transition', () => {
    const content = readFileSync(join(DOCS_DIR, 'design-phase.md'), 'utf-8');
    assert.ok(
      content.includes('review') && (content.includes('gate') || content.includes('Gate') || content.includes('pass') || content.includes('PASS')),
      'Missing design-to-build gate transition'
    );
  });

  it('should link to skill reference entries', () => {
    const content = readFileSync(join(DOCS_DIR, 'design-phase.md'), 'utf-8');
    assert.ok(content.includes('skills.md'), 'Missing link to skill reference');
  });

  it('should link to build-phase.md as next phase', () => {
    const content = readFileSync(join(DOCS_DIR, 'design-phase.md'), 'utf-8');
    assert.ok(content.includes('build-phase.md'), 'Missing next-phase link to build-phase.md');
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/docs/workflow-guides.test.mjs`
Expected: FAIL — docs/design-phase.md does not exist yet

- [x] **Implement**

Read SKILL.md files for brainstorm, specify, review-specs, and prototype to source accurate descriptions. Create `docs/design-phase.md` with:

- Title: "Design Phase"
- Brief intro explaining the design phase and its purpose in the lifecycle
- **Brainstorm** section (`/adev:brainstorm`):
  - What: Explore a feature idea interactively and produce a Feature Charter
  - When: Starting any new feature or module
  - Prerequisites: Constitution and manifest must exist
  - Example invocation: `/adev:brainstorm`
  - Output: A Feature Charter in `.context-index/specs/features/<name>/charter.md`
  - Link to skill reference entry
- **Specify** section (`/adev:specify`):
  - What: Author Live Specs defining behavioral contracts
  - When: After a charter is approved, for each capability
  - Prerequisites: Approved charter
  - Example invocation: `/adev:specify`
  - Output: A Live Spec in `.context-index/specs/features/<name>/<spec>.spec.md`
  - Link to skill reference entry
- **Review Specs** section (`/adev:review-specs`):
  - What: Run parallel specialist architecture reviews on specs
  - When: After writing a spec, before planning
  - Prerequisites: A Live Spec exists
  - Example invocation: `/adev:review-specs`
  - Output: A review file with PASS/FAIL verdict
  - Link to skill reference entry
- **Prototype** section (`/adev:prototype`):
  - What: Rapidly sketch UI screens and flows from charters
  - When: Optionally, to validate UX before committing to implementation
  - Prerequisites: A charter exists
  - Example invocation: `/adev:prototype`
  - Output: UI mockups and flow diagrams
  - Link to skill reference entry
- **Moving to Build** transition section:
  - Gate: All specs must have review-passed verdict before planning
  - What to check: Review file exists with PASS or PASS_WITH_NOTES
  - Source gate conditions from hooks/hooks.json (SA-2)

- [x] **Verify test passes**

Run: `node --test tests/docs/workflow-guides.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add docs/design-phase.md tests/docs/workflow-guides.test.mjs
git commit -m "feat(user-docs): add docs/design-phase.md workflow guide

Spec: .context-index/specs/features/user-docs/workflow-guides.spec.md
Plan-task: 1"
```

---

### Task 2: Write docs/build-phase.md — Build Phase Guide [specialist: none]

**Charter capability:** Build Phase Guide
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `docs/build-phase.md`
- Modify: `tests/docs/workflow-guides.test.mjs`

**Tests:** `tests/docs/workflow-guides.test.mjs`

- [x] **Write failing test**

Add to `tests/docs/workflow-guides.test.mjs`:

```javascript
describe('docs/build-phase.md — Build Phase Guide', () => {
  it('should exist', () => {
    assert.ok(existsSync(join(DOCS_DIR, 'build-phase.md')));
  });

  it('should cover plan skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'build-phase.md'), 'utf-8');
    assert.ok(content.includes('/adev:plan'), 'Missing /adev:plan invocation');
  });

  it('should cover route skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'build-phase.md'), 'utf-8');
    assert.ok(content.includes('/adev:route'), 'Missing /adev:route invocation');
  });

  it('should cover implement skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'build-phase.md'), 'utf-8');
    assert.ok(content.includes('/adev:implement'), 'Missing /adev:implement invocation');
  });

  it('should cover write-test skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'build-phase.md'), 'utf-8');
    assert.ok(content.includes('/adev:write-test'), 'Missing /adev:write-test invocation');
  });

  it('should cover build skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'build-phase.md'), 'utf-8');
    assert.ok(content.includes('/adev:build'), 'Missing /adev:build invocation');
  });

  it('should describe TDD workflow', () => {
    const content = readFileSync(join(DOCS_DIR, 'build-phase.md'), 'utf-8');
    assert.ok(content.includes('TDD') || content.includes('test-driven'), 'Missing TDD description');
  });

  it('should link to skill reference entries', () => {
    const content = readFileSync(join(DOCS_DIR, 'build-phase.md'), 'utf-8');
    assert.ok(content.includes('skills.md'), 'Missing link to skill reference');
  });

  it('should link to validate-debug.md as next phase', () => {
    const content = readFileSync(join(DOCS_DIR, 'build-phase.md'), 'utf-8');
    assert.ok(content.includes('validate-debug.md'), 'Missing next-phase link to validate-debug.md');
  });

  it('should document the review-passed gate prerequisite', () => {
    const content = readFileSync(join(DOCS_DIR, 'build-phase.md'), 'utf-8');
    assert.ok(
      content.includes('review') && (content.includes('prerequisite') || content.includes('Prerequisite') || content.includes('gate') || content.includes('before')),
      'Missing review-passed prerequisite description'
    );
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/docs/workflow-guides.test.mjs`
Expected: FAIL — docs/build-phase.md does not exist yet

- [x] **Implement**

Read SKILL.md files for plan, route, implement, write-test, and build to source accurate descriptions. Create `docs/build-phase.md` with:

- Title: "Build Phase"
- Brief intro explaining the build phase and how it follows design
- **Prerequisites** box: All specs must have passed architecture review
- **Plan** section (`/adev:plan`):
  - What: Decompose reviewed specs into ordered implementation tasks with TDD expectations
  - When: After specs pass review
  - Prerequisites: Review-passed spec
  - Example invocation: `/adev:plan`
  - Output: A plan file with task breakdown, context packets, parallelization hints
  - Link to skill reference entry
- **Route** section (`/adev:route`):
  - What: Score tasks on routing matrix and recommend auto-agent, assisted-agent, or human-only
  - When: After planning, before implementation
  - Prerequisites: A plan exists
  - Example invocation: `/adev:route`
  - Output: Routing recommendations per task
  - Link to skill reference entry
- **Write Test** section (`/adev:write-test`):
  - What: TDD test authoring — write failing tests (RED phase)
  - When: Before implementation, or standalone for test coverage
  - Prerequisites: A spec defining expected behavior
  - Example invocation: `/adev:write-test`
  - Output: Failing test files with immutable handoff blocks
  - Link to skill reference entry
- **Implement** section (`/adev:implement`):
  - What: Execute plan tasks with TDD enforcement and 2-stage review
  - When: After planning (and optionally routing)
  - Prerequisites: Plan file and passing tests infrastructure
  - Example invocation: `/adev:implement`
  - Output: Implemented code with passing tests and commit trailers
  - Link to skill reference entry
- **Build** section (`/adev:build`):
  - What: End-to-end orchestrator chaining review, plan, route, implement, validate
  - When: When you want to execute a full pipeline without manual handoffs
  - Prerequisites: A reviewed spec
  - Example invocation: `/adev:build`
  - Output: Fully implemented and validated feature
  - Link to skill reference entry
- **Moving to Validation** transition section:
  - Gate: All plan tasks implemented, tests passing, quality gates green

- [x] **Verify test passes**

Run: `node --test tests/docs/workflow-guides.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add docs/build-phase.md tests/docs/workflow-guides.test.mjs
git commit -m "feat(user-docs): add docs/build-phase.md workflow guide

Spec: .context-index/specs/features/user-docs/workflow-guides.spec.md
Plan-task: 2"
```

---

### Task 3: Write docs/validate-debug.md — Validate & Debug Guide [specialist: none]

**Charter capability:** Validate & Debug Guide
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `docs/validate-debug.md`
- Modify: `tests/docs/workflow-guides.test.mjs`

**Tests:** `tests/docs/workflow-guides.test.mjs`

- [x] **Write failing test**

Add to `tests/docs/workflow-guides.test.mjs`:

```javascript
describe('docs/validate-debug.md — Validate & Debug Guide', () => {
  it('should exist', () => {
    assert.ok(existsSync(join(DOCS_DIR, 'validate-debug.md')));
  });

  it('should cover validate skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'validate-debug.md'), 'utf-8');
    assert.ok(content.includes('/adev:validate'), 'Missing /adev:validate invocation');
  });

  it('should cover debug skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'validate-debug.md'), 'utf-8');
    assert.ok(content.includes('/adev:debug'), 'Missing /adev:debug invocation');
  });

  it('should cover eval skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'validate-debug.md'), 'utf-8');
    assert.ok(content.includes('/adev:eval'), 'Missing /adev:eval invocation');
  });

  it('should cover recover skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'validate-debug.md'), 'utf-8');
    assert.ok(content.includes('/adev:recover'), 'Missing /adev:recover invocation');
  });

  it('should link to skill reference entries', () => {
    const content = readFileSync(join(DOCS_DIR, 'validate-debug.md'), 'utf-8');
    assert.ok(content.includes('skills.md'), 'Missing link to skill reference');
  });

  it('should link to maintain.md as next phase', () => {
    const content = readFileSync(join(DOCS_DIR, 'validate-debug.md'), 'utf-8');
    assert.ok(content.includes('maintain.md'), 'Missing next-phase link to maintain.md');
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/docs/workflow-guides.test.mjs`
Expected: FAIL — docs/validate-debug.md does not exist yet

- [x] **Implement**

Read SKILL.md files for validate, debug, eval, and recover to source accurate descriptions. Create `docs/validate-debug.md` with:

- Title: "Validate & Debug"
- Brief intro explaining this phase covers quality assurance and troubleshooting
- **Validate** section (`/adev:validate`):
  - What: Post-implementation validation with 13 ordered checks
  - When: After implementation is complete
  - Prerequisites: Implemented code, passing tests
  - Example invocation: `/adev:validate`
  - Output: Structured PASS/FAIL report with file references
  - Link to skill reference entry
- **Debug** section (`/adev:debug`):
  - What: Context-aware systematic debugging checking ADRs, specs, and architecture
  - When: Any bug, test failure, or unexpected behavior
  - Prerequisites: A failing test or error to investigate
  - Example invocation: `/adev:debug`
  - Output: Root cause analysis and fix
  - Link to skill reference entry
- **Eval** section (`/adev:eval`):
  - What: Graduated evaluation harness (0-100) scoring implementation quality
  - When: For quality scoring and benchmarking
  - Prerequisites: Implemented feature to evaluate
  - Example invocation: `/adev:eval`
  - Output: Quality score across four layers (deterministic, architectural, LLM-as-Judge, human)
  - Link to skill reference entry
- **Recover** section (`/adev:recover`):
  - What: Structured diagnosis-correction-resume cycle for stuck agents
  - When: When an agent is stuck, looping, or not making progress
  - Prerequisites: A stalled or failing implementation task
  - Example invocation: `/adev:recover`
  - Output: Recovery record and re-dispatched task with corrective context
  - Link to skill reference entry
- **Next: Maintain** transition section

- [x] **Verify test passes**

Run: `node --test tests/docs/workflow-guides.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add docs/validate-debug.md tests/docs/workflow-guides.test.mjs
git commit -m "feat(user-docs): add docs/validate-debug.md workflow guide

Spec: .context-index/specs/features/user-docs/workflow-guides.spec.md
Plan-task: 3"
```

---

### Task 4: Write docs/maintain.md — Maintain Phase Guide [specialist: none]

**Charter capability:** Maintain Phase Guide
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `docs/maintain.md`
- Modify: `tests/docs/workflow-guides.test.mjs`

**Tests:** `tests/docs/workflow-guides.test.mjs`

- [x] **Write failing test**

Add to `tests/docs/workflow-guides.test.mjs`:

```javascript
describe('docs/maintain.md — Maintain Phase Guide', () => {
  it('should exist', () => {
    assert.ok(existsSync(join(DOCS_DIR, 'maintain.md')));
  });

  it('should cover issues skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'maintain.md'), 'utf-8');
    assert.ok(content.includes('/adev:issues'), 'Missing /adev:issues invocation');
  });

  it('should cover status skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'maintain.md'), 'utf-8');
    assert.ok(content.includes('/adev:status'), 'Missing /adev:status invocation');
  });

  it('should cover hygiene skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'maintain.md'), 'utf-8');
    assert.ok(content.includes('/adev:hygiene'), 'Missing /adev:hygiene invocation');
  });

  it('should cover retro skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'maintain.md'), 'utf-8');
    assert.ok(content.includes('/adev:retro'), 'Missing /adev:retro invocation');
  });

  it('should cover codehealth skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'maintain.md'), 'utf-8');
    assert.ok(content.includes('/adev:codehealth'), 'Missing /adev:codehealth invocation');
  });

  it('should cover repomap skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'maintain.md'), 'utf-8');
    assert.ok(content.includes('/adev:repomap'), 'Missing /adev:repomap invocation');
  });

  it('should cover reconcile skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'maintain.md'), 'utf-8');
    assert.ok(content.includes('/adev:reconcile'), 'Missing /adev:reconcile invocation');
  });

  it('should cover sample skill', () => {
    const content = readFileSync(join(DOCS_DIR, 'maintain.md'), 'utf-8');
    assert.ok(content.includes('/adev:sample'), 'Missing /adev:sample invocation');
  });

  it('should link to skill reference entries', () => {
    const content = readFileSync(join(DOCS_DIR, 'maintain.md'), 'utf-8');
    assert.ok(content.includes('skills.md'), 'Missing link to skill reference');
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/docs/workflow-guides.test.mjs`
Expected: FAIL — docs/maintain.md does not exist yet

- [x] **Implement**

Read SKILL.md files for issues, status, hygiene, retro, codehealth, repomap, reconcile, and sample to source accurate descriptions. Create `docs/maintain.md` with:

- Title: "Maintain"
- Brief intro explaining the maintain phase covers ongoing project health
- **Issues** section (`/adev:issues`):
  - What: Manage project issues and epics (create, update, close, view board)
  - When: Tracking work items, filing bugs, viewing the board
  - Prerequisites: Task management configured in manifest
  - Example invocation: `/adev:issues`
  - Link to skill reference entry
- **Status** section (`/adev:status`):
  - What: Query project status across charters, specs, capabilities, sessions
  - When: Checking progress, getting a dashboard view
  - Prerequisites: Context index exists
  - Example invocation: `/adev:status`
  - Link to skill reference entry
- **Hygiene** section (`/adev:hygiene`):
  - What: Audit context for staleness, drift, and coverage gaps
  - When: Periodically, or before major work
  - Prerequisites: Context index populated
  - Example invocation: `/adev:hygiene`
  - Link to skill reference entry
- **Retro** section (`/adev:retro`):
  - What: Analyze completed work for lessons, metrics, and improvements
  - When: After completing a feature or sprint
  - Prerequisites: Completed work with commits
  - Example invocation: `/adev:retro`
  - Link to skill reference entry
- **Codehealth** section (`/adev:codehealth`):
  - What: Scan for dead exports, orphan files, unused dependencies
  - When: Before refactoring or cleanup
  - Prerequisites: Repomap artifacts
  - Example invocation: `/adev:codehealth`
  - Link to skill reference entry
- **Repomap** section (`/adev:repomap`):
  - What: Generate AST-based symbol index of the repository
  - When: Mapping codebase structure, preparing for drift detection
  - Prerequisites: Source code files
  - Example invocation: `/adev:repomap`
  - Link to skill reference entry
- **Reconcile** section (`/adev:reconcile`):
  - What: Interactive repair for lifecycle mismatches
  - When: Hygiene reveals inconsistencies
  - Prerequisites: Hygiene report or status showing mismatches
  - Example invocation: `/adev:reconcile`
  - Link to skill reference entry
- **Sample** section (`/adev:sample`):
  - What: Curate annotated golden samples as reference implementations
  - When: Building a sample library for subagent guidance
  - Prerequisites: Quality implementations to curate
  - Example invocation: `/adev:sample`
  - Link to skill reference entry

- [x] **Verify test passes**

Run: `node --test tests/docs/workflow-guides.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add docs/maintain.md tests/docs/workflow-guides.test.mjs
git commit -m "feat(user-docs): add docs/maintain.md workflow guide

Spec: .context-index/specs/features/user-docs/workflow-guides.spec.md
Plan-task: 4"
```

---

### Task 5: Update TOC links and verify cross-page links [specialist: none]

**Charter capability:** Table of Contents (link integrity)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2, Task 3, Task 4
**Files:**
- Modify: `docs/README.md`
- Modify: `docs/design-phase.md`
- Modify: `docs/build-phase.md`
- Modify: `docs/validate-debug.md`
- Modify: `docs/maintain.md`
- Modify: `tests/docs/workflow-guides.test.mjs`

**Tests:** `tests/docs/workflow-guides.test.mjs`

- [x] **Write failing test**

Add to `tests/docs/workflow-guides.test.mjs`:

```javascript
describe('Workflow Guides — TOC and cross-page links', () => {
  it('should have all four workflow guides linked from README.md', () => {
    const content = readFileSync(join(DOCS_DIR, 'README.md'), 'utf-8');
    assert.ok(content.includes('design-phase.md'), 'Missing link to design-phase.md');
    assert.ok(content.includes('build-phase.md'), 'Missing link to build-phase.md');
    assert.ok(content.includes('validate-debug.md'), 'Missing link to validate-debug.md');
    assert.ok(content.includes('maintain.md'), 'Missing link to maintain.md');
  });

  it('should not have "coming soon" for workflow guide entries in README.md', () => {
    const content = readFileSync(join(DOCS_DIR, 'README.md'), 'utf-8');
    const workflowSection = content.split('## Workflow')[1]?.split('##')[0] || '';
    assert.ok(!workflowSection.includes('coming soon'), 'Workflow Guides section still has "coming soon" entries');
  });

  it('should have all relative links in workflow guides resolve to existing files', () => {
    const pages = ['design-phase.md', 'build-phase.md', 'validate-debug.md', 'maintain.md'];
    for (const page of pages) {
      const content = readFileSync(join(DOCS_DIR, page), 'utf-8');
      const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
      let match;
      while ((match = linkPattern.exec(content)) !== null) {
        const target = match[2];
        if (target.startsWith('http') || target.startsWith('#')) continue;
        const filePart = target.split('#')[0];
        if (filePart) {
          const targetPath = join(DOCS_DIR, filePart);
          assert.ok(
            existsSync(targetPath),
            `${page}: broken link to ${target} (expected file at ${targetPath})`
          );
        }
      }
    }
  });

  it('should have sequential next-phase links', () => {
    const design = readFileSync(join(DOCS_DIR, 'design-phase.md'), 'utf-8');
    assert.ok(design.includes('build-phase.md'), 'design-phase.md should link to build-phase.md');

    const build = readFileSync(join(DOCS_DIR, 'build-phase.md'), 'utf-8');
    assert.ok(build.includes('validate-debug.md'), 'build-phase.md should link to validate-debug.md');

    const validate = readFileSync(join(DOCS_DIR, 'validate-debug.md'), 'utf-8');
    assert.ok(validate.includes('maintain.md'), 'validate-debug.md should link to maintain.md');
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/docs/workflow-guides.test.mjs`
Expected: FAIL — README.md still has "coming soon" for workflow guides

- [x] **Implement**

1. Update `docs/README.md` Workflow Guides section to replace "coming soon" entries with live links:
   - `[Design Phase](design-phase.md)` — Brainstorm, charter, specify, review, and prototype
   - `[Build Phase](build-phase.md)` — Plan, route, implement, write tests, and orchestrate
   - `[Validate & Debug](validate-debug.md)` — Validate work, debug issues, and run evals
   - `[Maintain](maintain.md)` — Track issues, run hygiene, retrospectives, and keep context healthy
2. Verify next-phase links exist at bottom of each guide (already added in Tasks 1-4)
3. Scan all four guides for broken relative links and fix any found
4. Update `docs/getting-started.md` next-page link if it referenced design-phase.md as "coming soon"

- [x] **Verify test passes**

Run: `node --test tests/docs/workflow-guides.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add docs/README.md docs/design-phase.md docs/build-phase.md docs/validate-debug.md docs/maintain.md tests/docs/workflow-guides.test.mjs
git commit -m "feat(user-docs): link workflow guides from TOC and verify cross-page links

Spec: .context-index/specs/features/user-docs/workflow-guides.spec.md
Plan-task: 5"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [ ] Tests pass: `npm test`
- [ ] All acceptance criteria from spec satisfied:
  - [ ] `docs/design-phase.md` covers design skills (brainstorm, specify, review-specs, prototype) with examples
  - [ ] `docs/build-phase.md` covers build skills (plan, route, implement, write-test, build) with examples
  - [ ] `docs/validate-debug.md` covers validation skills (validate, debug, eval, recover) with examples
  - [ ] `docs/maintain.md` covers maintenance skills (issues, status, hygiene, retro, codehealth, repomap, reconcile, sample) with examples
  - [ ] Each skill mention includes what it does, when to use it, and a link to reference
  - [ ] Phase transitions and gates are documented
  - [ ] All four guides are reachable from docs/README.md
  - [ ] Skill descriptions match current SKILL.md content
  - [ ] No constitutional violations introduced
