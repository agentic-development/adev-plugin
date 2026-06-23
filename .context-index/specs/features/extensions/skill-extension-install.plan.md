<!-- partial_schema: plan@1 -->

# Implementation Plan: `provides.skill_extensions` — Domain Extension Skill Injection

> **Methodology:** adev
> **Charter:** .context-index/specs/features/extensions/charter.md
> **Spec:** .context-index/specs/features/extensions/skill-extension-install.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-25)
> **Platform:** JavaScript (ESM), Node.js, npm, node:test

**Goal:** Implement `provides.skill_extensions` support in `adev extension install`, enabling extension packs to ship skill augmentation files that are copied to `.context-index/skill-extensions/_<ext-name>/<skill>.md` at install time.

**Architecture:** The new `installSkillExtensions()` function is added to the existing `lib/extensions/content-install.mjs` module, following the module's established pattern of pure file-system operations using only `node:fs` and `node:path`. The `lib/extensions/install.mjs` orchestrator calls it in sequence after existing content types. The `lib/extensions/manifest-schema.mjs` schema is extended to pass through `provides.skill_extensions` (a map). The `_<ext-name>/` prefix convention distinguishes extension-managed files from project-level `skill-extensions/<skill>.md` files, which are never touched.

> **Review note SA-1:** The spec's Behavioral Contract mentions rejecting non-markdown content but no explicit error code was defined. Per the review verdict (PASS_WITH_NOTES), this plan adds an `INVALID_FILE_TYPE` error case to the implementation (Task 1) to close this gap.

---

## File Structure

**Create:**
- `tests/extensions/skill-extension-install.test.mjs` — Unit tests covering all Behaviors and Acceptance Criteria

**Modify:**
- `lib/extensions/manifest-schema.mjs` — Pass through `provides.skill_extensions` map in validated manifest output
- `lib/extensions/content-install.mjs` — Add `installSkillExtensions()` function
- `lib/extensions/install.mjs` — Wire `installSkillExtensions()` into the install sequence after existing content types; add results to install report
- `templates/adev-extension.example.yaml` — Add commented `provides.skill_extensions` example block
- `docs/extensions.md` — Document `provides.skill_extensions` key, `_<ext-name>/` convention, and interaction with project-level files

**Reference (read, do not modify):**
- `.context-index/specs/features/extensions/skill-extension-install.spec.md` — Behavioral contract, acceptance criteria
- `.context-index/specs/features/extensions/charter.md` — Capability map, invariants
- `lib/extensions/content-install.mjs` — Established patterns (path containment, error codes, `copyFileSync`)
- `tests/cli-extension.test.mjs` — CLI-level extension test patterns
- `tests/helpers.mjs` — `createTempDir`, `cleanupTempDir`, `writeFixture`

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/extensions/skill-extension-install.spec.md` (Behaviors 1-8, Error Cases, Acceptance Criteria)
- Charter: `.context-index/specs/features/extensions/charter.md` (capability: Skill Extension Installation)
- Source files: `lib/extensions/manifest-schema.mjs` (full — pass-through pattern for `provides`), `lib/extensions/content-install.mjs` (full — PATH_TRAVERSAL pattern and error codes to follow)
- ADR: none required (no new deps, pure ESM, node:fs only)

### Task 2 Context
- Spec: `.context-index/specs/features/extensions/skill-extension-install.spec.md` (all Behaviors, all Error Cases)
- Source files: `lib/extensions/content-install.mjs` (full — append installSkillExtensions function after checkSkillConflicts), `lib/extensions/install.mjs` (lines 68-147 — orchestration pattern to wire new step)
- Tests: `tests/extensions/skill-extension-install.test.mjs` (failing tests from Task 3 drive this)
- ADR: `.context-index/adrs/` — no relevant ADR; Constitution Principle 1 (no new deps) applies directly

### Task 3 Context
- Spec: `.context-index/specs/features/extensions/skill-extension-install.spec.md` (Behaviors 1-8, all Acceptance Criteria including the `docs` and `template` ACs)
- Source files: `tests/cli-extension.test.mjs` (full — fixture and assertion patterns), `tests/helpers.mjs` (helpers API), `lib/extensions/content-install.mjs` (function signatures to test against)
- Charter: `.context-index/specs/features/extensions/charter.md` (Invariants — idempotency, safety)

### Task 4 Context
- Spec: `.context-index/specs/features/extensions/skill-extension-install.spec.md` (Acceptance Criteria AC 9)
- Source files: `templates/adev-extension.example.yaml` (full — append skill_extensions block following existing comment style)

### Task 5 Context
- Spec: `.context-index/specs/features/extensions/skill-extension-install.spec.md` (Acceptance Criteria AC 10, Behavioral Contract paragraph 2)
- Source files: `docs/extensions.md` (full — identify the `provides.samples` or `provides.skills` section to follow for placement)

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 (manifest schema feeds implementation feeds tests)
- Group B (independent): Task 4 (template update — no shared source file dependency with A)
- Group C (independent): Task 5 (docs update — no shared source file dependency with A or B)

Groups B and C can run in parallel with each other after Task 1 completes (they only need to know the schema shape, which is fixed by the spec). Group A must run sequentially.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Extend manifest schema for `provides.skill_extensions` | small | unit | — | 0 create, 1 modify |
| 2 | Add `installSkillExtensions()` and wire into orchestrator | small | unit | Task 1 | 0 create, 2 modify |
| 3 | Add `tests/extensions/skill-extension-install.test.mjs` | small | unit | Task 2 | 1 create, 0 modify |
| 4 | Update `adev-extension.example.yaml` template | small | unit | Task 1 | 0 create, 1 modify |
| 5 | Update `docs/extensions.md` | small | unit | Task 1 | 0 create, 1 modify |

---

### Task 1: Extend manifest schema for `provides.skill_extensions` [specialist: none]

**Charter capability:** Skill Extension Installation (`provides.skill_extensions`)
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/extensions/manifest-schema.mjs`
- Test: `tests/extensions/skill-extension-install.test.mjs` (written in Task 3, but schema tests are first)

**Tests:** `tests/extensions/skill-extension-install.test.mjs` — schema validation tests (written in Task 3; this task implements the code the tests exercise)

**Context to load:**
- `lib/extensions/manifest-schema.mjs` — current `provides` pass-through logic (line 130)
- `.context-index/specs/features/extensions/skill-extension-install.spec.md` — Preconditions for skill name validation (`[a-zA-Z0-9_-]+`)

- [ ] **Write failing test**

In `tests/extensions/skill-extension-install.test.mjs` (stub or use this task's write-failing-test step):

```javascript
import { parseExtensionManifest } from '../../lib/extensions/manifest-schema.mjs';
describe('manifest-schema: provides.skill_extensions pass-through', () => {
  it('passes through skill_extensions map', () => {
    const yaml = 'name: my-ext\nversion: 1.0.0\nprovides:\n  skill_extensions:\n    implement: skills/implement.md\n';
    const result = parseExtensionManifest(yaml);
    assert.equal(result.valid, true);
    assert.deepEqual(result.manifest.provides.skill_extensions, { implement: 'skills/implement.md' });
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/extensions/skill-extension-install.test.mjs`
Expected: FAIL — `skill_extensions` not present in parsed manifest (the existing code does a generic `provides` pass-through which should actually already include it; the test file doesn't exist yet so this step is creating it with a failing stub)

- [ ] **Implement**

In `lib/extensions/manifest-schema.mjs`, verify that `provides.skill_extensions` is already passed through via the generic `obj.provides` copy (line 130). If so, no code change is needed — the schema test in Task 3 will confirm. If the schema strips unknown keys inside `provides`, add explicit pass-through for `skill_extensions`:

```javascript
// No change needed if provides is copied as-is.
// If provides is filtered, add:
if (obj.provides?.skill_extensions != null) {
  manifest.provides.skill_extensions = obj.provides.skill_extensions;
}
```

- [ ] **Verify test passes**

Run: `node --test tests/extensions/skill-extension-install.test.mjs`
Expected: PASS (schema test)

- [ ] **Commit**

Branch (if not already created): `feat/extensions/skill-extension-install`

```bash
git add lib/extensions/manifest-schema.mjs tests/extensions/skill-extension-install.test.mjs
git commit -m "feat(extensions): pass through provides.skill_extensions in manifest schema

Spec: .context-index/specs/features/extensions/skill-extension-install.spec.md
Plan-task: 1"
```

---

### Task 2: Add `installSkillExtensions()` and wire into install orchestrator [specialist: none]

**Charter capability:** Skill Extension Installation (`provides.skill_extensions`)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `lib/extensions/content-install.mjs`
- Modify: `lib/extensions/install.mjs`
- Test: `tests/extensions/skill-extension-install.test.mjs`

**Tests:** `tests/extensions/skill-extension-install.test.mjs` — all Behavior tests (Behaviors 1-8) and Error Cases

**Context to load:**
- `lib/extensions/content-install.mjs` — full file; append after `checkSkillConflicts()`
- `lib/extensions/install.mjs` — section 3d/3e for wiring pattern; add step 3e after existing content steps
- `.context-index/specs/features/extensions/skill-extension-install.spec.md` — Error Cases table (INVALID_SKILL_NAME, PATH_TRAVERSAL, MISSING_SKILL_EXT_FILE, INSTALL_IO_ERROR, INVALID_FILE_TYPE)

- [ ] **Write failing test**

Add to `tests/extensions/skill-extension-install.test.mjs`:

```javascript
import { installSkillExtensions } from '../../lib/extensions/content-install.mjs';
describe('installSkillExtensions', () => {
  it('copies a single skill extension file', () => {
    // writeFixture ext source, assert dest exists
  });
  it('rejects invalid skill name', () => {
    // assert throws with code INVALID_SKILL_NAME
  });
  it('rejects path traversal in source', () => {
    // assert throws with code PATH_TRAVERSAL
  });
  // ... more cases
});
```

- [ ] **Verify test fails**

Run: `node --test tests/extensions/skill-extension-install.test.mjs`
Expected: FAIL — `installSkillExtensions is not exported from content-install.mjs`

- [ ] **Implement**

Append to `lib/extensions/content-install.mjs` after the `checkSkillConflicts` function:

```javascript
// ── Skill Extension Installation ───────────────────────────────────────────

/** Valid skill name pattern per spec Preconditions. */
const SKILL_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Install skill extension files from an extension to the project's
 * `.context-index/skill-extensions/_<extName>/` directory.
 *
 * @param {string} projectRoot - Project root.
 * @param {string} extSourceDir - Extension source directory.
 * @param {string} extName - Extension name (kebab-case).
 * @param {Record<string, string>} skillExtensions - Map of skill name → source path.
 * @returns {{ filesWritten: string[] }}
 */
export function installSkillExtensions(projectRoot, extSourceDir, extName, skillExtensions) {
  const filesWritten = [];
  const resolvedExtDir = resolve(extSourceDir);

  // Validate all entries first (fail-fast before any writes)
  for (const [skillName, srcRelative] of Object.entries(skillExtensions)) {
    // 1. Validate skill name
    if (!SKILL_NAME_PATTERN.test(skillName)) {
      const err = new Error(`Skill name '${skillName}' is invalid. Must match [a-zA-Z0-9_-]+.`);
      err.code = 'INVALID_SKILL_NAME';
      throw err;
    }

    // 2. Validate source path containment (path traversal)
    const srcFull = resolve(resolvedExtDir, srcRelative);
    if (!srcFull.startsWith(resolvedExtDir + '/') && srcFull !== resolvedExtDir) {
      const err = new Error(`Source path '${srcRelative}' escapes the extension root.`);
      err.code = 'PATH_TRAVERSAL';
      throw err;
    }

    // 3. Validate source file exists
    if (!existsSync(srcFull)) {
      const err = new Error(`Declared skill extension source file '${srcRelative}' does not exist in extension.`);
      err.code = 'MISSING_SKILL_EXT_FILE';
      throw err;
    }

    // 4. Validate file type — must be .md (review note SA-1)
    if (!srcRelative.endsWith('.md')) {
      const err = new Error(`Skill extension source '${srcRelative}' is not a markdown file. Extension files must be .md.`);
      err.code = 'INVALID_FILE_TYPE';
      throw err;
    }
  }

  // All entries valid — create the namespaced dir and copy
  const extSkillDir = join(projectRoot, '.context-index', 'skill-extensions', `_${extName}`);
  try {
    mkdirSync(extSkillDir, { recursive: true });
  } catch (ioErr) {
    const err = new Error(`Cannot create directory '${extSkillDir}': ${ioErr.message}`);
    err.code = 'INSTALL_IO_ERROR';
    throw err;
  }

  for (const [skillName, srcRelative] of Object.entries(skillExtensions)) {
    const srcFull = resolve(resolvedExtDir, srcRelative);
    const destPath = join(extSkillDir, `${skillName}.md`);
    copyFileSync(srcFull, destPath);
    filesWritten.push(destPath);
  }

  return { filesWritten };
}
```

In `lib/extensions/install.mjs`, add import and wiring after step 3d (skill conflict detection):

```javascript
import { installDomainProfile, mergeGovernanceEntries, installSamples, checkSkillConflicts, installSkillExtensions } from './content-install.mjs';

// After step 3d (provides.skills conflict detection), add step 3e:
// 3e. Skill extensions
if (provides.skill_extensions && typeof provides.skill_extensions === 'object' && !Array.isArray(provides.skill_extensions)) {
  const report = installSkillExtensions(projectRoot, resolvedPath, manifest.name, provides.skill_extensions);
  filesWritten.push(...report.filesWritten);
}
```

- [ ] **Verify test passes**

Run: `node --test tests/extensions/skill-extension-install.test.mjs`
Expected: PASS — all Behavior tests and Error Case tests pass

- [ ] **Commit**

```bash
git add lib/extensions/content-install.mjs lib/extensions/install.mjs
git commit -m "feat(extensions): add installSkillExtensions() with INVALID_FILE_TYPE error case

Adds installSkillExtensions() to content-install.mjs with validation for
skill name pattern, path traversal, missing source file, and non-markdown
source (INVALID_FILE_TYPE per review note SA-1). Wires into install.mjs
orchestrator after existing content steps.

Spec: .context-index/specs/features/extensions/skill-extension-install.spec.md
Plan-task: 2"
```

---

### Task 3: Add test suite `tests/extensions/skill-extension-install.test.mjs` [specialist: none]

**Charter capability:** Skill Extension Installation (`provides.skill_extensions`)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Create: `tests/extensions/skill-extension-install.test.mjs`
- Test: `tests/extensions/skill-extension-install.test.mjs`

**Tests:** `tests/extensions/skill-extension-install.test.mjs` — full coverage of all 8 Behaviors + 4 Error Cases + integration via `installExtension()`

**Context to load:**
- `tests/cli-extension.test.mjs` — fixture patterns (`writeFixture`, `createTempDir`, `mkdirSync`)
- `tests/helpers.mjs` — helpers API
- `.context-index/specs/features/extensions/skill-extension-install.spec.md` — all Behaviors and Acceptance Criteria

- [ ] **Write failing test**

The full test file covers Behaviors 1-8 and Error Cases. Per TDD order (Tasks 1 and 2 implement before this completes, but this task writes the complete final test file):

```javascript
/**
 * Tests for provides.skill_extensions — skill extension install.
 * Spec: .context-index/specs/features/extensions/skill-extension-install.spec.md
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir, writeFixture } from '../helpers.mjs';
import { installSkillExtensions } from '../../lib/extensions/content-install.mjs';
import { installExtension } from '../../lib/extensions/install.mjs';

describe('installSkillExtensions()', () => {
  let tmp, extDir;
  beforeEach(() => { tmp = createTempDir(); extDir = createTempDir(); });
  afterEach(() => { cleanupTempDir(tmp); cleanupTempDir(extDir); });

  // Behavior 1: single extension copied to _<ext-name>/
  it('copies a single skill extension to _<ext-name>/<skill>.md', () => {
    writeFixture(extDir, 'skills/implement.md', '# Implement extension\n');
    const result = installSkillExtensions(tmp, extDir, 'my-ext', { implement: 'skills/implement.md' });
    const dest = join(tmp, '.context-index', 'skill-extensions', '_my-ext', 'implement.md');
    assert.ok(existsSync(dest), 'dest file should exist');
    assert.equal(readFileSync(dest, 'utf8'), '# Implement extension\n');
    assert.ok(result.filesWritten.includes(dest));
  });

  // Behavior 2: multiple skill names
  it('copies multiple skill extensions each to their own file', () => {
    writeFixture(extDir, 'skills/implement.md', '# impl\n');
    writeFixture(extDir, 'skills/plan.md', '# plan\n');
    installSkillExtensions(tmp, extDir, 'my-ext', {
      implement: 'skills/implement.md',
      plan: 'skills/plan.md',
    });
    assert.ok(existsSync(join(tmp, '.context-index', 'skill-extensions', '_my-ext', 'implement.md')));
    assert.ok(existsSync(join(tmp, '.context-index', 'skill-extensions', '_my-ext', 'plan.md')));
  });

  // Behavior 3: re-install overwrites
  it('overwrites _<ext-name>/ files on re-install (idempotent)', () => {
    writeFixture(extDir, 'skills/implement.md', 'v1\n');
    installSkillExtensions(tmp, extDir, 'my-ext', { implement: 'skills/implement.md' });
    writeFixture(extDir, 'skills/implement.md', 'v2\n');
    installSkillExtensions(tmp, extDir, 'my-ext', { implement: 'skills/implement.md' });
    const dest = join(tmp, '.context-index', 'skill-extensions', '_my-ext', 'implement.md');
    assert.equal(readFileSync(dest, 'utf8'), 'v2\n');
  });

  // Behavior 4: invalid skill name
  it('throws INVALID_SKILL_NAME for skill name with / before any writes', () => {
    writeFixture(extDir, 'skills/implement.md', '# impl\n');
    const err = assert.throws(() => installSkillExtensions(tmp, extDir, 'my-ext', { 'path/hack': 'skills/implement.md' }));
    assert.equal(err.code, 'INVALID_SKILL_NAME');
    assert.ok(!existsSync(join(tmp, '.context-index', 'skill-extensions', '_my-ext')), 'no dir created');
  });

  // Behavior 5: path traversal in source
  it('throws PATH_TRAVERSAL for source path escaping extension root before any writes', () => {
    const err = assert.throws(() => installSkillExtensions(tmp, extDir, 'my-ext', { implement: '../../etc/passwd' }));
    assert.equal(err.code, 'PATH_TRAVERSAL');
    assert.ok(!existsSync(join(tmp, '.context-index', 'skill-extensions', '_my-ext')), 'no dir created');
  });

  // Behavior 6: missing source file
  it('throws MISSING_SKILL_EXT_FILE when declared file does not exist', () => {
    const err = assert.throws(() => installSkillExtensions(tmp, extDir, 'my-ext', { implement: 'skills/nonexistent.md' }));
    assert.equal(err.code, 'MISSING_SKILL_EXT_FILE');
  });

  // INVALID_FILE_TYPE (review note SA-1)
  it('throws INVALID_FILE_TYPE for non-markdown source file', () => {
    writeFixture(extDir, 'skills/implement.sh', '#!/bin/sh\n');
    const err = assert.throws(() => installSkillExtensions(tmp, extDir, 'my-ext', { implement: 'skills/implement.sh' }));
    assert.equal(err.code, 'INVALID_FILE_TYPE');
  });

  // Behavior 7: absent or empty provides.skill_extensions → no directory created
  it('is a no-op when called with empty map', () => {
    installSkillExtensions(tmp, extDir, 'my-ext', {});
    assert.ok(!existsSync(join(tmp, '.context-index', 'skill-extensions', '_my-ext')), 'no dir should be created');
  });

  // Behavior 8: project-level file untouched
  it('never touches project-level skill-extensions/<skill>.md', () => {
    writeFixture(extDir, 'skills/implement.md', '# ext\n');
    writeFixture(tmp, '.context-index/skill-extensions/implement.md', '# project\n');
    installSkillExtensions(tmp, extDir, 'my-ext', { implement: 'skills/implement.md' });
    const projectFile = join(tmp, '.context-index', 'skill-extensions', 'implement.md');
    assert.equal(readFileSync(projectFile, 'utf8'), '# project\n', 'project file must be untouched');
  });
});

describe('installExtension() with provides.skill_extensions', () => {
  let tmp, extDir;
  beforeEach(() => {
    tmp = createTempDir();
    extDir = createTempDir();
    writeFixture(tmp, '.context-index/manifest.yaml', 'project:\n  name: test\n');
  });
  afterEach(() => { cleanupTempDir(tmp); cleanupTempDir(extDir); });

  it('includes skill extension files in install report filesWritten', async () => {
    writeFixture(extDir, 'adev-extension.yaml',
      'name: skill-ext\nversion: 1.0.0\nprovides:\n  skill_extensions:\n    implement: skills/implement.md\n');
    writeFixture(extDir, 'skills/implement.md', '# impl\n');
    const report = await installExtension(extDir, tmp);
    assert.ok(report.filesWritten.some(f => f.includes('_skill-ext') && f.includes('implement.md')));
  });

  it('skips skill extension step when provides.skill_extensions is absent', async () => {
    writeFixture(extDir, 'adev-extension.yaml', 'name: no-ext\nversion: 1.0.0\nprovides: {}\n');
    await assert.doesNotReject(() => installExtension(extDir, tmp));
    assert.ok(!existsSync(join(tmp, '.context-index', 'skill-extensions', '_no-ext')));
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/extensions/skill-extension-install.test.mjs`
Expected: FAIL (before Tasks 1 and 2 are implemented); after Tasks 1 and 2 complete, the same command should PASS.

- [ ] **Verify test passes**

Run: `node --test tests/extensions/skill-extension-install.test.mjs`
Expected: PASS — all 10 test cases pass

Also verify no regressions:
Run: `npm test`
Expected: PASS — all existing extension tests continue to pass

- [ ] **Commit**

```bash
git add tests/extensions/skill-extension-install.test.mjs
git commit -m "test(extensions): add skill-extension-install test suite

Covers all 8 Behaviors + 4 Error Cases + INVALID_FILE_TYPE (review note SA-1)
+ integration via installExtension(). All AC from the spec are covered.

Spec: .context-index/specs/features/extensions/skill-extension-install.spec.md
Plan-task: 3"
```

---

### Task 4: Update `adev-extension.example.yaml` template [specialist: none]

**Charter capability:** Extension Authoring Documentation Bundle (template completeness)
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `templates/adev-extension.example.yaml`
- Test: `tests/extensions/skill-extension-install.test.mjs` (AC 9 verified by reading file content)

**Tests:** `tests/extensions/skill-extension-install.test.mjs` — AC 9: file contains a `provides.skill_extensions` example (or verified manually)

**Context to load:**
- `templates/adev-extension.example.yaml` — full file; append `skill_extensions` block after `provides.samples`

- [ ] **Write failing test**

Add to test file or verify manually that `adev-extension.example.yaml` does not yet contain `skill_extensions`:

```bash
grep "skill_extensions" templates/adev-extension.example.yaml
# Expected: no output (AC 9 not yet satisfied)
```

- [ ] **Implement**

Append a new commented section to `templates/adev-extension.example.yaml` after the `# ── provides.samples` block:

```yaml
  # ── provides.skill_extensions ──────────────────────────────────────────
  #
  # Map of skill name → source markdown file path (relative to extension root).
  # At install time, each file is copied to:
  #   .context-index/skill-extensions/_<ext-name>/<skill>.md
  #
  # Skill names must match [a-zA-Z0-9_-]+. Source files must be .md.
  # The `_<ext-name>/` prefix signals extension-managed content.
  # The project-level file skill-extensions/<skill>.md is never touched.
  # Install is idempotent: re-running overwrites the _<ext-name>/ files.
  #
  # These files are read at skill invocation time by `adev skill-ext load`
  # (defined in cli/skill-ext-load.spec.md).
  #
  # skill_extensions:
  #   implement: skills/implement-extension.md
  #   plan: skills/plan-extension.md
```

- [ ] **Verify**

Run: `grep "skill_extensions" templates/adev-extension.example.yaml`
Expected: output contains the commented example.

- [ ] **Commit**

```bash
git add templates/adev-extension.example.yaml
git commit -m "docs(extensions): add provides.skill_extensions example to adev-extension.example.yaml

Spec: .context-index/specs/features/extensions/skill-extension-install.spec.md
Plan-task: 4"
```

---

### Task 5: Update `docs/extensions.md` authoring guide [specialist: none]

**Charter capability:** Extension Authoring Documentation Bundle
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `docs/extensions.md`

**Tests:** `tests/extensions/skill-extension-install.test.mjs` — AC 10 (docs content verified by grep or manual review)

**Context to load:**
- `docs/extensions.md` — full file; identify placement for the new `provides.skill_extensions` section (follow `provides.samples` or `provides.skills` placement)

- [ ] **Write failing test**

Verify docs do not yet document `skill_extensions`:

```bash
grep "skill_extensions" docs/extensions.md
# Expected: no output
```

- [ ] **Implement**

Add a new `### provides.skill_extensions` subsection to `docs/extensions.md`. Place it after the existing `provides.samples` or `provides.skills` section. Content:

```markdown
### provides.skill_extensions

Extensions can ship **skill augmentation files** that append instructions to specific adev skills at the project level.

```yaml
provides:
  skill_extensions:
    implement: skills/implement-extension.md
    plan: skills/plan-extension.md
```

**Key:** skill name (must match `[a-zA-Z0-9_-]+`)
**Value:** path to a `.md` file within the extension root

**Install behavior:**

At install time, `adev extension install` copies each declared file to:

```
.context-index/skill-extensions/_<ext-name>/<skill>.md
```

The `_<ext-name>/` prefix signals that the file is extension-managed. It is distinct from the project-level file at `skill-extensions/<skill>.md`, which is **never touched** by the installer.

**Idempotency:** Re-running `adev extension install` overwrites the `_<ext-name>/` files with the latest content from the extension source.

**Consumption:** Skill extension files are read at skill invocation time by `adev skill-ext load` (see `cli/skill-ext-load.spec.md`). The `adev skill-ext load <skill>` verb concatenates the project-level and all extension-level files for the named skill and returns the merged instructions.

**Constraints:**
- Skill names must match `[a-zA-Z0-9_-]+` (fails with `INVALID_SKILL_NAME`).
- Source paths must not escape the extension root (fails with `PATH_TRAVERSAL`).
- Declared source files must exist (fails with `MISSING_SKILL_EXT_FILE`).
- Source files must be `.md` (fails with `INVALID_FILE_TYPE`).
```

- [ ] **Verify**

Run: `grep "skill_extensions" docs/extensions.md`
Expected: output contains the documented key.

- [ ] **Commit**

```bash
git add docs/extensions.md
git commit -m "docs(extensions): document provides.skill_extensions key and _<ext-name>/ convention

Spec: .context-index/specs/features/extensions/skill-extension-install.spec.md
Plan-task: 5"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- Lint passes: (no lint configured — Constitution Principle 3 compliance checked by node:test)
- All acceptance criteria from spec satisfied

Specific acceptance criteria traceability:
- AC 1-3 → Task 2 (installSkillExtensions copy + overwrite) + Task 3 (Behaviors 1-3 tests)
- AC 4 → Task 2 (project file untouched) + Task 3 (Behavior 8 test)
- AC 5 → Task 2 (INVALID_SKILL_NAME) + Task 3 (Behavior 4 test)
- AC 6 → Task 2 (PATH_TRAVERSAL) + Task 3 (Behavior 5 test)
- AC 7 → Task 2 (MISSING_SKILL_EXT_FILE) + Task 3 (Behavior 6 test)
- AC 8 → Task 2 (Behavior 7 — no dir created) + Task 3 (Behavior 7 test)
- AC 9 → Task 4 (template update)
- AC 10 → Task 5 (docs update)
- AC 11 → `npm test` full pass
- AC 12 → no `package.json` changes (verified by `git diff package.json`)
- Review note SA-1 (INVALID_FILE_TYPE) → Task 2 implementation + Task 3 test
