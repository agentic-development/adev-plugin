# Implementation Plan: Standalone Invocation

> **Methodology:** adev
> **Charter:** .context-index/specs/features/prototype-brainstorm/charter.md
> **Spec:** .context-index/specs/features/prototype-brainstorm/standalone-invocation.spec.md
> **Review:** PASS (2026-05-08)
> **Platform:** Node.js, JavaScript (ESM), node:test, npm

**Goal:** Add standalone invocation support to `/adev:prototype` — argument parsing (`--module`, `--tier`, `--framework`), charter discovery when `--module` is omitted, context construction from charter and platform files, and session summary output.

**Architecture:** This is entirely a SKILL.md enhancement. The existing `skills/prototype/SKILL.md` implements the core prototype loop (tier selection, generation, serving, feedback, persistence). This plan adds the standalone entry path that precedes the core loop: argument validation, charter discovery/loading, context construction, and the session-end summary. All changes are in the skill markdown file — no new library code is needed (constitution principle #2: skills are primarily markdown). The spec's behaviors map to SKILL.md sections that wrap and extend the existing flow.

---

## File Structure

**Modify:**
- `skills/prototype/SKILL.md` — Add standalone invocation sections: argument validation, charter discovery, context construction, closed-charter warning, session summary output
- `tests/skills/prototype-standalone.test.mjs` — Test argument validation regex and charter discovery glob logic via inline Node.js snippets extracted into a testable helper

**Create:**
- `lib/prototype-args.mjs` — Lightweight argument/module validation helper (`validateModuleName(name)` and `discoverCharters(projectRoot)`) extracted for testability. The SKILL.md references these but functions without them (fallback to inline logic per constitution principle #2).
- `tests/lib/prototype-args.test.mjs` — Unit tests for module name validation and charter discovery

**Reference (read, do not modify):**
- `.context-index/specs/features/prototype-brainstorm/charter.md` — Capability tracing
- `.context-index/specs/features/prototype-brainstorm/prototype-core.spec.md` — Core loop behaviors (referenced, not modified)
- `.context-index/specs/features/prototype-brainstorm/brainstorm-integration.spec.md` — Heuristics and return contract (referenced)
- `skills/prototype/SKILL.md` — Existing skill structure to extend
- `lib/heuristics.mjs` — Existing heuristics retrieval API
- `lib/prototype-server.mjs` — Existing server helper (already has `validateModuleName` — check for reuse)

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/prototype-brainstorm/standalone-invocation.spec.md` (Behaviors 1, Error Cases: INVALID_MODULE_NAME)
- Charter: `.context-index/specs/features/prototype-brainstorm/charter.md` (capability: Standalone invocation)
- Source files: `lib/prototype-server.mjs` (check if `validateModuleName` already exists for reuse)
- Constitution: `.context-index/constitution.md` (Principle #2: skills are primarily markdown, Principle #3: pure ESM)

### Task 2 Context
- Spec: `.context-index/specs/features/prototype-brainstorm/standalone-invocation.spec.md` (Behaviors 2-4, Error Cases: NO_CHARTERS)
- Task 1 artifacts: `lib/prototype-args.mjs` (validateModuleName)
- Charter: `.context-index/specs/features/prototype-brainstorm/charter.md` (capability: Standalone invocation)

### Task 3 Context
- Spec: `.context-index/specs/features/prototype-brainstorm/standalone-invocation.spec.md` (Behaviors 1, 5-7, 9-10, Error Cases)
- Spec: `.context-index/specs/features/prototype-brainstorm/brainstorm-integration.spec.md` (Behaviors 5-6, heuristics preload)
- Source files: `skills/prototype/SKILL.md` (existing structure to extend)
- Source files: `lib/heuristics.mjs` (retrieveHeuristics API)
- Source files: `lib/prototype-args.mjs` (Task 1 output — validation helpers)

### Task 4 Context
- Spec: `.context-index/specs/features/prototype-brainstorm/standalone-invocation.spec.md` (Behavior 8, session summary)
- Spec: `.context-index/specs/features/prototype-brainstorm/brainstorm-integration.spec.md` (Behavior 4 — structured result for return contract reference)
- Source files: `skills/prototype/SKILL.md` (existing Step 8 heuristics section)

## Parallelization

- Group A (sequential): Task 1 → Task 2 (Task 2 uses validateModuleName from Task 1)
- Group B (depends on Task 1, Task 2): Task 3 (SKILL.md update references both helpers)
- Group C (depends on Task 3): Task 4 (session summary section extends the SKILL.md from Task 3)

Tasks within each group are sequential. No parallel groups due to shared file dependencies on SKILL.md and the helper module.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Module name validation and charter discovery helpers | small | unit | — | 1 create, 1 create (test) |
| 2 | Charter discovery tests | small | unit | Task 1 | 0 create, 1 modify (test) |
| 3 | SKILL.md standalone invocation sections | medium | unit | Task 1, Task 2 | 0 create, 1 modify |
| 4 | Session summary output | small | unit | Task 3 | 0 create, 1 modify |

---

### Task 1: Module Name Validation and Charter Discovery Helpers [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** Fully specified regex validation and directory scanning with a matching library module golden sample and zero blast radius.

**Charter capability:** Standalone invocation
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/prototype-args.mjs`
- Create: `tests/lib/prototype-args.test.mjs`

**Tests:** `tests/lib/prototype-args.test.mjs`

**Context to load:**
- `.context-index/specs/features/prototype-brainstorm/standalone-invocation.spec.md` (Behavior 1: regex `^[a-z0-9][a-z0-9-]*$`, max 64 chars; Behaviors 2-4: charter discovery)
- `lib/prototype-server.mjs` (check for existing `validateModuleName` to reuse or re-export)

- [x] **Write failing test**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('prototype-args', () => {
  describe('validateModuleName', () => {
    it('accepts valid kebab-case names', async () => {
      const { validateModuleName } = await import('../../lib/prototype-args.mjs');
      assert.equal(validateModuleName('task-boards'), true);
      assert.equal(validateModuleName('a'), true);
      assert.equal(validateModuleName('my-module-123'), true);
    });

    it('rejects names with invalid characters', async () => {
      const { validateModuleName } = await import('../../lib/prototype-args.mjs');
      assert.equal(validateModuleName('Task-Boards'), false);     // uppercase
      assert.equal(validateModuleName('my.module'), false);       // dots
      assert.equal(validateModuleName('my/module'), false);       // path separator
      assert.equal(validateModuleName('my module'), false);       // spaces
      assert.equal(validateModuleName('-starts-dash'), false);    // starts with dash
      assert.equal(validateModuleName(''), false);                // empty
    });

    it('rejects names exceeding 64 characters', async () => {
      const { validateModuleName } = await import('../../lib/prototype-args.mjs');
      const longName = 'a'.repeat(65);
      assert.equal(validateModuleName(longName), false);
      assert.equal(validateModuleName('a'.repeat(64)), true);
    });
  });

  describe('discoverCharters', () => {
    it('exports discoverCharters function', async () => {
      const { discoverCharters } = await import('../../lib/prototype-args.mjs');
      assert.equal(typeof discoverCharters, 'function');
    });
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/lib/prototype-args.test.mjs`
Expected: FAIL — module `../../lib/prototype-args.mjs` not found

- [x] **Implement**

Create `lib/prototype-args.mjs` with two exports:

1. `validateModuleName(name)` — returns `true` if `name` matches `^[a-z0-9][a-z0-9-]*$` and length <= 64.
2. `discoverCharters(projectRoot)` — globs `.context-index/specs/features/*/charter.md`, returns array of `{ module, title, path }` objects. Uses `fs.readdirSync` + `fs.existsSync` (no glob dependency). Extracts title from first `# ` heading line in each charter.

```javascript
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MODULE_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
const MAX_MODULE_LENGTH = 64;

export function validateModuleName(name) {
  if (!name || name.length > MAX_MODULE_LENGTH) return false;
  return MODULE_NAME_RE.test(name);
}

export function discoverCharters(projectRoot) {
  const featuresDir = join(projectRoot, '.context-index', 'specs', 'features');
  if (!existsSync(featuresDir)) return [];
  const modules = readdirSync(featuresDir, { withFileTypes: true })
    .filter(d => d.isDirectory());
  const charters = [];
  for (const dir of modules) {
    const charterPath = join(featuresDir, dir.name, 'charter.md');
    if (existsSync(charterPath)) {
      const content = readFileSync(charterPath, 'utf8');
      const titleMatch = content.match(/^#\s+(?:Feature Charter:\s*)?(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : dir.name;
      charters.push({ module: dir.name, title, path: charterPath });
    }
  }
  return charters;
}
```

- [x] **Verify test passes**

Run: `node --test tests/lib/prototype-args.test.mjs`
Expected: PASS

Run: `npm test`
Expected: PASS — no regression

- [x] **Commit**

Branch (if not already created): `feat/prototype-brainstorm/standalone-invocation`

```bash
git add lib/prototype-args.mjs tests/lib/prototype-args.test.mjs
git commit -m "feat(design): add module validation and charter discovery helpers

Spec: .context-index/specs/features/prototype-brainstorm/standalone-invocation.spec.md
Plan-task: 1"
```

---

### Task 2: Charter Discovery Tests [specialist: none]

**Routing:** auto-agent (score: 19/20)
**Scores:** spec=5 pattern=4 blast=5 novelty=5
**Rationale:** Standard unit test additions using documented test helpers for fully enumerated discovery scenarios.

**Charter capability:** Standalone invocation
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `tests/lib/prototype-args.test.mjs`

**Tests:** `tests/lib/prototype-args.test.mjs`

**Context to load:**
- `.context-index/specs/features/prototype-brainstorm/standalone-invocation.spec.md` (Behaviors 2-4)
- `lib/prototype-args.mjs` (Task 1 output)
- `tests/helpers.mjs` (createTempDir, cleanupTempDir, writeFixture)

- [x] **Write failing test**

```javascript
import { createTempDir, cleanupTempDir, writeFixture } from '../helpers.mjs';

describe('discoverCharters', () => {
  it('returns empty array when no charters exist', async () => {
    const { discoverCharters } = await import('../../lib/prototype-args.mjs');
    const tmpDir = createTempDir();
    const result = discoverCharters(tmpDir);
    assert.deepEqual(result, []);
    cleanupTempDir(tmpDir);
  });

  it('discovers single charter with title', async () => {
    const { discoverCharters } = await import('../../lib/prototype-args.mjs');
    const tmpDir = createTempDir();
    writeFixture(tmpDir, '.context-index/specs/features/task-boards/charter.md',
      '# Feature Charter: Task Management Boards\n\nContent here.');
    const result = discoverCharters(tmpDir);
    assert.equal(result.length, 1);
    assert.equal(result[0].module, 'task-boards');
    assert.equal(result[0].title, 'Task Management Boards');
    cleanupTempDir(tmpDir);
  });

  it('discovers multiple charters', async () => {
    const { discoverCharters } = await import('../../lib/prototype-args.mjs');
    const tmpDir = createTempDir();
    writeFixture(tmpDir, '.context-index/specs/features/task-boards/charter.md',
      '# Feature Charter: Tasks\n');
    writeFixture(tmpDir, '.context-index/specs/features/notifications/charter.md',
      '# Feature Charter: Notifications\n');
    const result = discoverCharters(tmpDir);
    assert.equal(result.length, 2);
    cleanupTempDir(tmpDir);
  });

  it('skips directories without charter.md', async () => {
    const { discoverCharters } = await import('../../lib/prototype-args.mjs');
    const tmpDir = createTempDir();
    writeFixture(tmpDir, '.context-index/specs/features/task-boards/charter.md',
      '# Feature Charter: Tasks\n');
    writeFixture(tmpDir, '.context-index/specs/features/orphan/some-spec.md',
      '# Not a charter\n');
    const result = discoverCharters(tmpDir);
    assert.equal(result.length, 1);
    assert.equal(result[0].module, 'task-boards');
    cleanupTempDir(tmpDir);
  });
});
```

- [x] **Verify test fails**

Run: `node --test tests/lib/prototype-args.test.mjs`
Expected: FAIL — new tests fail (charter discovery edge cases not yet handled or tests newly added)

- [x] **Implement**

Add the charter discovery tests to the existing test file. Ensure `discoverCharters` handles:
- Missing `.context-index/` directory
- Directories under features/ that don't contain `charter.md`
- Charter files without a `# ` heading (fallback to directory name as title)

Fix any issues found in `lib/prototype-args.mjs` during test-driven development.

- [x] **Verify test passes**

Run: `node --test tests/lib/prototype-args.test.mjs`
Expected: PASS

Run: `npm test`
Expected: PASS

- [x] **Commit**

```bash
git add tests/lib/prototype-args.test.mjs lib/prototype-args.mjs
git commit -m "test(design): add charter discovery tests for standalone invocation

Covers no-charters, single-charter, multi-charter, and skip-non-charter
directory scenarios.

Spec: .context-index/specs/features/prototype-brainstorm/standalone-invocation.spec.md
Plan-task: 2"
```

---

### Task 3: SKILL.md Standalone Invocation Sections [specialist: none]

**Routing:** auto-agent (score: 16/20)
**Scores:** spec=4 pattern=3 blast=5 novelty=4
**Rationale:** Well-specified behaviors but no curated SKILL.md authoring sample; existing prototype SKILL.md provides discoverable pattern.

**Charter capability:** Standalone invocation
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2
**Files:**
- Modify: `skills/prototype/SKILL.md`

**Tests:** `tests/lib/prototype-args.test.mjs` — standalone path is SKILL.md instructions; tested indirectly through the helper module tests. No separate test file for SKILL.md content (constitution principle #2).

**Context to load:**
- `.context-index/specs/features/prototype-brainstorm/standalone-invocation.spec.md` (all behaviors)
- `.context-index/specs/features/prototype-brainstorm/brainstorm-integration.spec.md` (Behavior 5-6: standalone charter lookup, Behavior 10: heuristics preload)
- `skills/prototype/SKILL.md` (existing structure — Arguments section, Step 1, Step 2)
- `lib/prototype-args.mjs` (helpers to reference)
- `lib/heuristics.mjs` (retrieveHeuristics API)

- [x] **Write failing test**

Verification is structural — the SKILL.md must contain specific sections after modification:
1. An "Arguments" section listing `--module`, `--tier`, `--framework`
2. A "Standalone Entry" or equivalent section with module validation, charter discovery, and context construction
3. Reference to `validateModuleName` from `lib/prototype-args.mjs`
4. Reference to `discoverCharters` from `lib/prototype-args.mjs`
5. Closed charter warning text
6. Missing platform-context warning text
7. Missing constitution error text

Run: `grep -c 'validateModuleName\|discoverCharters\|INVALID_MODULE_NAME\|NO_CHARTERS\|CHARTER_NOT_FOUND\|NO_CONSTITUTION\|NO_PLATFORM_CONTEXT' skills/prototype/SKILL.md`
Expected: FAIL — these patterns are not yet in the SKILL.md

- [x] **Verify test fails**

Run: `grep -c 'discoverCharters' skills/prototype/SKILL.md`
Expected: 0 (not yet present)

- [x] **Implement**

Update `skills/prototype/SKILL.md` to add standalone invocation support. The key changes:

**1. Update Arguments section** to document all three arguments with validation rules:
- `--module <name>`: validates against `^[a-z0-9][a-z0-9-]*$` (max 64 chars)
- `--tier <wireframe|mockup|functional>`: skips tier selection prompt
- `--framework <react|vue|svelte|vanilla>`: only with `--tier functional`

**2. Add "Step 0: Standalone Entry" section** before current Step 1, covering:

a. **Module validation (Behavior 1):** When `--module` is provided, validate with `validateModuleName()`:
```bash
node -e "import { validateModuleName } from '<ADEV_ROOT>/lib/prototype-args.mjs'; console.log(validateModuleName('<module>'));"
```
On failure: `"Invalid module name: '<value>'. Must be kebab-case (lowercase letters, numbers, hyphens)."`

b. **Charter discovery (Behaviors 2-4):** When `--module` is NOT provided:
```bash
node -e "import { discoverCharters } from '<ADEV_ROOT>/lib/prototype-args.mjs'; console.log(JSON.stringify(discoverCharters(process.cwd())));"
```
- Zero charters: error with `/adev:brainstorm` suggestion (Behavior 4)
- One charter: auto-select with confirmation (Behavior 2)
- Multiple charters: list and prompt (Behavior 3)

c. **Context construction (Behavior 1):** Load charter at `.context-index/specs/features/<module>/charter.md`, extract approach from Business Intent and Capability Map, load platform-context.yaml, load constitution constraints. If charter not found: error `CHARTER_NOT_FOUND`.

d. **Closed charter warning (Behavior 9):** Check charter frontmatter `status: closed` and emit warning.

e. **Missing platform-context.yaml (Error table):** Warning, proceed without framework defaults.

f. **Missing constitution.md (Error table):** Error, block session.

**3. Update Step 2 (Tier Selection)** to handle `--tier` argument (Behavior 5):
- If `--tier` provided with valid value, skip the interactive prompt
- If `--tier` provided with invalid value, error (do not re-prompt)

**4. Update framework handling** for `--framework` (Behaviors 6-7):
- With `--tier functional`: skip framework prompt
- Without functional tier: ignore with note

**5. Ensure heuristics preload (Behavior 10)** is in Step 1 (already present — verify it covers standalone path).

- [x] **Verify test passes**

Run: `grep -c 'discoverCharters' skills/prototype/SKILL.md`
Expected: >= 1

Run: `grep -c 'INVALID_MODULE_NAME\|NO_CHARTERS\|CHARTER_NOT_FOUND\|NO_CONSTITUTION\|NO_PLATFORM_CONTEXT\|FRAMEWORK_IGNORED' skills/prototype/SKILL.md`
Expected: >= 6 (all error codes present)

Run: `npm test`
Expected: PASS — no regression

- [x] **Commit**

```bash
git add skills/prototype/SKILL.md
git commit -m "feat(design): add standalone invocation path to prototype skill

Adds argument validation, charter discovery, context construction,
closed-charter warning, and --tier/--framework argument shortcuts.

Spec: .context-index/specs/features/prototype-brainstorm/standalone-invocation.spec.md
Plan-task: 3"
```

---

### Task 4: Session Summary Output [specialist: none]

**Routing:** auto-agent (score: 17/20)
**Scores:** spec=4 pattern=3 blast=5 novelty=5
**Rationale:** Clearly defined summary fields from spec Behavior 8; mechanical markdown section addition with no blast radius.

**Charter capability:** Standalone invocation
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Files:**
- Modify: `skills/prototype/SKILL.md`

**Tests:** `tests/lib/prototype-args.test.mjs` — session summary is SKILL.md instructions; no separate test needed.

**Context to load:**
- `.context-index/specs/features/prototype-brainstorm/standalone-invocation.spec.md` (Behavior 8: session summary)
- `.context-index/specs/features/prototype-brainstorm/brainstorm-integration.spec.md` (Behavior 4: structured result — session summary mirrors this)
- `skills/prototype/SKILL.md` (Step 8 Heuristics Capture — summary goes after this)

- [x] **Write failing test**

Run: `grep -c 'Session Summary\|session summary\|iteration_count\|persistence choice' skills/prototype/SKILL.md`
Expected: 0 (session summary section not yet present)

- [x] **Verify test fails**

Run: `grep -c 'Session Summary' skills/prototype/SKILL.md`
Expected: 0

- [x] **Implement**

Add a "Step 9: Session Summary" section to `skills/prototype/SKILL.md` after Step 8 (Heuristics Capture):

```markdown
### Step 9: Session Summary (Standalone Only)

When invoked standalone (not from brainstorm), output a session summary after heuristics capture. When invoked from brainstorm, skip this step — the return-to-brainstorm contract handles the result.

> **Prototype Session Complete**
>
> - **Module:** <module>
> - **Tier:** <wireframe|mockup|functional>
> - **Iterations:** <iteration_count>
> - **Persistence:** <"project" (kept at .adev/prototype/<module>/) | "ephemeral" (discarded)>
> - **Visual references:** <count> captured
> - **Heuristics saved:** <count>

No return-to-brainstorm step is performed. The session ends here.
```

Also update the Error Reference table to include all error codes from the standalone spec.

- [x] **Verify test passes**

Run: `grep -c 'Session Summary' skills/prototype/SKILL.md`
Expected: >= 1

Run: `npm test`
Expected: PASS — no regression

- [x] **Commit**

```bash
git add skills/prototype/SKILL.md
git commit -m "feat(design): add session summary output for standalone prototype sessions

Outputs tier, iteration count, persistence choice, visual references,
and heuristics count at end of standalone sessions.

Spec: .context-index/specs/features/prototype-brainstorm/standalone-invocation.spec.md
Plan-task: 4"
```

---

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [ ] Tests pass: `npm test`
- [ ] All acceptance criteria from spec satisfied:
  - [ ] `--module` value validated against `^[a-z0-9][a-z0-9-]*$` (max 64 chars)
  - [ ] Charter discovery uses glob-equivalent `.context-index/specs/features/*/charter.md`
  - [ ] `/adev:prototype --module <name>` loads charter and constructs context without brainstorm
  - [ ] Approach context extracted from charter Business Intent and Capability Map
  - [ ] No `--module` with one charter: auto-selects with confirmation
  - [ ] No `--module` with multiple charters: lists and prompts
  - [ ] No `--module` with no charters: errors with `/adev:brainstorm` suggestion
  - [ ] `--tier` argument skips tier selection prompt
  - [ ] `--framework` argument skips framework prompt (functional tier only)
  - [ ] `--framework` without functional tier produces warning and is ignored
  - [ ] Closed charter produces warning but does not block
  - [ ] Session ends with summary (no brainstorm return)
  - [ ] Existing module heuristics surfaced before tier selection
  - [ ] Missing `platform-context.yaml` produces warning, does not block
  - [ ] Missing `constitution.md` produces error and blocks
  - [ ] No constitutional violations introduced
