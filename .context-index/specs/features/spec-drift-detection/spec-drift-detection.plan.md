<!-- DO NOT EDIT statuses inline — see lifecycle log spec-drift-detection.jsonl -->
# Implementation Plan: Spec Drift Detection

> **Methodology:** adev
> **Charter:** .context-index/specs/features/spec-drift-detection/charter.md
> **Specs:**
>   - .context-index/specs/features/spec-drift-detection/hook-side-drift-detection.spec.md
>   - .context-index/specs/features/spec-drift-detection/drift-flag-clearing.spec.md
>   - .context-index/specs/features/spec-drift-detection/skill-gate-integration.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-02)
> **Platform:** JavaScript (ESM), Node.js, node:test

**Goal:** Enable real-time detection of code-side drift by extending the existing PostToolUse:Edit hook to detect edits to source-manifest-tracked files, stamp drift flags on affected specs, and integrate with downstream skills (plan blocks, validate warns, implement clears, hygiene reports).

**Architecture:** The core library `lib/spec-drift.mjs` provides four functions (`scanForDrift`, `stampDrift`, `clearDrift`, `hasDrift`) using only Node.js built-ins. `scanForDrift` delegates to `buildReverseIndex()` from `lib/source-manifest.mjs` for the file-to-spec mapping. The existing `hooks/sync-trigger.sh` is extended to call drift detection for all file edits (not just constitution edits). Downstream SKILL.md files add instructions for agents to call `hasDrift()` / `clearDrift()` via inline Node.js.

---

## File Structure

**Create:**
- `lib/spec-drift.mjs` — Core drift detection library (scanForDrift, stampDrift, clearDrift, hasDrift)
- `tests/lib/spec-drift.test.mjs` — Unit tests for drift detection library
- `tests/hooks/sync-trigger-drift.test.mjs` — Integration tests for hook drift detection path

**Modify:**
- `hooks/sync-trigger.sh` — Extend to detect drift on all file edits (not just constitution.md)
- `skills/plan/SKILL.md` — Add CODE_DRIFT gate before existing git-drift-detection check
- `skills/validate/SKILL.md` — Add non-blocking drift warning step
- `skills/hygiene/SKILL.md` — Add Code Drift audit pass
- `skills/implement/SKILL.md` — Add clearDrift() call after source manifest re-stamp

**Reference (read, do not modify):**
- `lib/source-manifest.mjs` — `buildReverseIndex()`, `extractManifestFromFrontmatter()` patterns
- `tests/lib/source-manifest.test.mjs` — Test pattern reference (temp project, fixture specs)
- `tests/helpers.mjs` — `createTempDir()`, `cleanupTempDir()`, `writeFixture()`, `runHook()`

## Context Packets

### Task 1 Context
- Spec: `hook-side-drift-detection.md` (behaviors 1-8, error cases)
- Charter: `charter.md` (Interface Contracts: Exposed APIs)
- Reference: `lib/source-manifest.mjs` (buildReverseIndex, extractManifestFromFrontmatter patterns)
- Reference: `tests/lib/source-manifest.test.mjs` (test structure pattern)

### Task 2 Context
- Spec: `hook-side-drift-detection.md` (behaviors 1-3, 6-7)
- Reference: `hooks/sync-trigger.sh` (current implementation)
- Reference: `tests/helpers.mjs` (runHook helper)

### Task 3 Context
- Spec: `drift-flag-clearing.md` (behaviors 1-4)
- Spec: `hook-side-drift-detection.md` (clearDrift contract)
- Reference: `skills/implement/SKILL.md` (source manifest re-stamp location)

### Task 4 Context
- Spec: `skill-gate-integration.md` (behaviors 1-3: Plan Gate)
- Reference: `skills/plan/SKILL.md` (existing drift detection gate)
- Reference: `lib/source-manifest.mjs` (verifyManifest for fallback)

### Task 5 Context
- Spec: `skill-gate-integration.md` (behaviors 4-6: Validate, 7-8: Hygiene)
- Reference: `skills/validate/SKILL.md` (existing check structure)
- Reference: `skills/hygiene/SKILL.md` (existing audit pass structure)

## Parallelization

- Group A (sequential): Task 1 → Task 2 (Task 2 depends on lib from Task 1)
- Group B (sequential): Task 3 (depends on Task 1 for clearDrift)
- Group C (independent): Task 4, Task 5 (SKILL.md edits, no shared file deps with A/B)

Groups A/B must complete before C (SKILL.md edits reference functions from lib/spec-drift.mjs). Task 4 and Task 5 can run in parallel with each other.

---

### Task 1: Create lib/spec-drift.mjs [specialist: none]

**Charter capability:** Edit-Time Drift Scan, Drift Flag Stamping, Advisory Warning Output, Drift Flag Clearing
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** none
**Files:**
- Create: `lib/spec-drift.mjs`
- Create: `tests/lib/spec-drift.test.mjs`

**Tests:** `tests/lib/spec-drift.test.mjs`

- [x] **Write failing tests**

```javascript
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanForDrift, stampDrift, clearDrift, hasDrift } from '../../lib/spec-drift.mjs';

describe('scanForDrift', () => {
  it('returns matching specs when file is tracked by source manifest', async () => {
    // Setup: temp dir with spec containing source-manifest tracking lib/foo.mjs
    // Assert: scanForDrift('lib/foo.mjs', root) returns [{ specPath, specName }]
  });

  it('returns empty array when file is not tracked', async () => {
    // Assert: scanForDrift('untracked.mjs', root) returns []
  });

  it('returns multiple specs when file is tracked by multiple specs', async () => {
    // Setup: two specs both tracking lib/shared.mjs
    // Assert: scanForDrift returns both
  });

  it('skips specs with malformed frontmatter', async () => {
    // Setup: spec with broken YAML
    // Assert: does not throw, returns empty
  });

  it('skips specs without source-manifest block', async () => {
    // Assert: returns empty, does not throw
  });

  it('returns empty when context-index does not exist', async () => {
    // Assert: returns empty
  });
});

describe('stampDrift', () => {
  it('writes drift_detected, drift_source, drift_at to frontmatter', async () => {
    // Assert: spec frontmatter contains all three fields after stamp
  });

  it('overwrites existing drift fields on re-stamp (idempotent)', async () => {
    // Assert: drift_source and drift_at are updated
  });

  it('stores drift_source as project-root-relative path', async () => {
    // Assert: drift_source is relative, not absolute
  });
});

describe('clearDrift', () => {
  it('removes all three drift fields from frontmatter', async () => {
    // Assert: drift_detected, drift_source, drift_at all gone
  });

  it('is a no-op on specs without drift fields', async () => {
    // Assert: file unchanged, no error
  });

  it('preserves other frontmatter fields', async () => {
    // Assert: charter, status, revision etc. untouched
  });
});

describe('hasDrift', () => {
  it('returns true when drift_detected is true', async () => {});
  it('returns false when drift_detected is absent', async () => {});
  it('returns false when drift_detected is false', async () => {});
  it('returns false for specs with malformed frontmatter', async () => {});
});
```

- [x] **Verify tests fail** — `node --test tests/lib/spec-drift.test.mjs`

Expected: FAIL — `scanForDrift is not defined` (module does not exist)

- [x] **Implement** `lib/spec-drift.mjs`

Four exported functions:
- `scanForDrift(filePath, contextIndexRoot)` — delegates to `buildReverseIndex()`, looks up filePath, returns `[{ specPath, specName }]`
- `stampDrift(specPath, driftSource)` — reads frontmatter, adds/overwrites `drift_detected: true`, `drift_source`, `drift_at` (ISO timestamp), writes back
- `clearDrift(specPath)` — reads frontmatter, removes drift fields, writes back
- `hasDrift(specPath)` — reads frontmatter, returns boolean

Implementation notes:
- Use simple regex-based frontmatter parsing (same pattern as `extractManifestFromFrontmatter` in `source-manifest.mjs`)
- `drift_source` stored as project-root-relative path
- All functions use `fs` and `path` built-ins only
- `stampDrift` and `clearDrift` do atomic read-modify-write (read file, modify frontmatter string, write file)
- Path validation: resolve to absolute, check within project root via `relative()` check

- [x] **Verify tests pass** — `node --test tests/lib/spec-drift.test.mjs`

- [x] **Commit**

```bash
git add lib/spec-drift.mjs tests/lib/spec-drift.test.mjs
git commit -m "feat(spec-drift-detection): add lib/spec-drift.mjs with scan, stamp, clear, hasDrift

Spec: .context-index/specs/features/spec-drift-detection/hook-side-drift-detection.spec.md
Plan-task: 1"
```

---

### Task 2: Extend sync-trigger.sh for drift detection [specialist: none]

**Charter capability:** Edit-Time Drift Scan, Advisory Warning Output
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `hooks/sync-trigger.sh`
- Create: `tests/hooks/sync-trigger-drift.test.mjs`

**Tests:** `tests/hooks/sync-trigger-drift.test.mjs`

- [x] **Write failing tests**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
// Use runHook from tests/helpers.mjs to invoke sync-trigger.sh
// with CLAUDE_TOOL_INPUT_file_path set to various paths

describe('sync-trigger drift detection', () => {
  it('emits JSON warning when edited file is tracked by a spec', async () => {
    // Setup: temp project with .context-index and spec with source-manifest
    // Run hook with file_path matching a tracked file
    // Assert: stdout contains JSON { type: "warning", message: "Spec drift:..." }
  });

  it('emits no warning when edited file is not tracked', async () => {
    // Assert: stdout is empty or contains no drift warning
  });

  it('still handles constitution.md edits (existing behavior)', async () => {
    // Assert: existing sync suggestion still works
  });

  it('skips drift scan when .context-index does not exist', async () => {
    // Assert: exits 0, no output
  });

  it('emits NO_MANIFEST advisory for specs without source manifest', async () => {
    // Assert: warning emitted on first invocation
  });

  it('suppresses NO_MANIFEST advisory on second invocation (session-scoped)', async () => {
    // Setup: run hook twice for same spec without source manifest
    // Assert: warning emitted first time, suppressed second time
    // Verify: execution state file key drift.no_manifest_warned_specs is set
  });

  it('always exits 0 (never blocks)', async () => {
    // Assert: exit code is 0 in all scenarios
  });

  it('skips files outside project root', async () => {
    // Assert: no warning for paths like /etc/passwd
  });
});
```

- [x] **Verify tests fail** — `node --test tests/hooks/sync-trigger-drift.test.mjs`

- [x] **Implement**

Modify `hooks/sync-trigger.sh`:
1. Keep existing constitution.md detection at the top
2. After the constitution check, add a new block: for all other file paths, call `lib/spec-drift.mjs` via inline Node.js:
   ```bash
   # Drift detection for all edits (non-constitution files)
   # Note: must use --input-type=module for ESM dynamic import in inline script
   node --input-type=module <<'DRIFT_EOF' 2>/dev/null || true
     const { scanForDrift, stampDrift } = await import('${PLUGIN_ROOT}/lib/spec-drift.mjs');
     const filePath = process.env.CLAUDE_TOOL_INPUT_file_path;
     // resolve, validate within project root, scan, stamp, emit JSON warnings
   DRIFT_EOF
   ```
3. Path validation: resolve `CLAUDE_TOOL_INPUT_file_path`, check within `$PWD`
4. If matches found: stamp each spec, emit JSON warning per spec
5. If no matches: exit 0 silently
6. NO_MANIFEST advisory: track via execution state file key `drift.no_manifest_warned_specs` (in-process Set will NOT persist across hook subprocess invocations)
7. Always exit 0

- [x] **Verify tests pass** — `node --test tests/hooks/sync-trigger-drift.test.mjs`

- [x] **Commit**

```bash
git add hooks/sync-trigger.sh tests/hooks/sync-trigger-drift.test.mjs
git commit -m "feat(spec-drift-detection): extend sync-trigger.sh with drift detection

Spec: .context-index/specs/features/spec-drift-detection/hook-side-drift-detection.spec.md
Plan-task: 2"
```

---

### Task 3: Add clearDrift to implement SKILL.md [specialist: none]

**Charter capability:** Drift Flag Clearing
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `skills/implement/SKILL.md`
- Create: `tests/skills/implement-drift-clearing.test.mjs`

**Tests:** `tests/skills/implement-drift-clearing.test.mjs`

- [x] **Write failing tests**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

describe('implement SKILL.md drift clearing instruction', () => {
  it('contains clearDrift instruction after source manifest re-stamp', () => {
    const content = readFileSync('skills/implement/SKILL.md', 'utf-8');
    assert.ok(content.includes('clearDrift'), 'SKILL.md should reference clearDrift');
  });

  it('clearDrift is called after computeManifest (correct ordering)', () => {
    const content = readFileSync('skills/implement/SKILL.md', 'utf-8');
    const manifestIdx = content.indexOf('source manifest');
    const clearIdx = content.indexOf('clearDrift');
    assert.ok(clearIdx > manifestIdx, 'clearDrift should come after source manifest');
  });
});
```

- [x] **Verify tests fail** — `node --test tests/skills/implement-drift-clearing.test.mjs`

- [x] **Implement**

Add instruction to `skills/implement/SKILL.md` after the source manifest re-stamp step (GREEN phase):

```markdown
After re-stamping the source manifest, clear any drift flag on the spec:
```javascript
const { clearDrift } = await import('<ADEV_ROOT>/lib/spec-drift.mjs');
await clearDrift(specPath);
```
If `clearDrift()` fails (e.g., write error), log a warning but do not block implementation completion.
```

- [x] **Verify tests pass** — `node --test tests/skills/implement-drift-clearing.test.mjs`

- [x] **Commit**

```bash
git add skills/implement/SKILL.md tests/skills/implement-drift-clearing.test.mjs
git commit -m "feat(spec-drift-detection): add clearDrift instruction to implement SKILL.md

Spec: .context-index/specs/features/spec-drift-detection/drift-flag-clearing.spec.md
Plan-task: 3"
```

---

### Task 4: Add CODE_DRIFT gate to plan SKILL.md [specialist: none]

**Charter capability:** Plan Gate Integration
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `skills/plan/SKILL.md`
- Create: `tests/skills/plan-drift-gate.test.mjs`

**Tests:** `tests/skills/plan-drift-gate.test.mjs`

- [x] **Write failing tests**

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

describe('plan SKILL.md drift gate', () => {
  it('contains CODE_DRIFT gate instruction', () => {
    const content = readFileSync('skills/plan/SKILL.md', 'utf-8');
    assert.ok(content.includes('CODE_DRIFT'), 'SKILL.md should reference CODE_DRIFT');
  });

  it('contains hasDrift check', () => {
    const content = readFileSync('skills/plan/SKILL.md', 'utf-8');
    assert.ok(content.includes('hasDrift'), 'SKILL.md should reference hasDrift');
  });

  it('contains verifyManifest fallback for non-Claude-Code hosts', () => {
    const content = readFileSync('skills/plan/SKILL.md', 'utf-8');
    assert.ok(content.includes('verifyManifest'), 'SKILL.md should reference verifyManifest fallback');
  });

  it('CODE_DRIFT gate comes before existing git-drift-detection', () => {
    const content = readFileSync('skills/plan/SKILL.md', 'utf-8');
    const driftIdx = content.indexOf('CODE_DRIFT');
    const gitDriftIdx = content.indexOf('REVISION_DRIFT');
    assert.ok(driftIdx < gitDriftIdx || gitDriftIdx === -1,
      'CODE_DRIFT should come before or exist without REVISION_DRIFT');
  });
});
```

- [x] **Verify tests fail** — `node --test tests/skills/plan-drift-gate.test.mjs`

- [x] **Implement**

Add to plan SKILL.md Step 1 (Review Gate), before the existing dual drift check:

```markdown
### Code-Side Drift Check

Before checking spec-side drift (revision/file hash), check for code-side drift:

1. Run inline Node.js to check the drift flag:
```javascript
const { hasDrift } = await import('<ADEV_ROOT>/lib/spec-drift.mjs');
const drifted = await hasDrift(specPath);
```

2. If `hasDrift()` returns `true`, **block**:
```
CODE_DRIFT: Spec "<name>" has drift_detected: true. Source file <drift_source>
was modified since last validation. Run /adev:validate or update the spec
before planning new work.
```

3. If `hasDrift()` returns `false`, also run `verifyManifest()` as a fallback
   (catches drift on non-Claude-Code hosts where the hook never fired):
```javascript
const { verifyManifest } = await import('<ADEV_ROOT>/lib/source-manifest.mjs');
const result = await verifyManifest(manifest, projectRoot);
if (!result.matches) { /* block with CODE_DRIFT message */ }
```

4. If `verifyManifest()` also fails (missing files), block with:
```
CODE_DRIFT_VERIFY_ERROR: Cannot verify source manifest for spec "<name>" —
<N> files missing. Run /adev:hygiene to diagnose, or /adev:implement to
re-stamp the manifest.
```

5. If `hasDrift()` throws (malformed frontmatter), **block** (fail-closed):
```
CODE_DRIFT_READ_ERROR: Cannot read drift status for spec "<name>" —
frontmatter may be malformed. Fix the spec frontmatter before planning.
```
```

- [x] **Verify tests pass** — `node --test tests/skills/plan-drift-gate.test.mjs`

- [x] **Commit**

```bash
git add skills/plan/SKILL.md tests/skills/plan-drift-gate.test.mjs
git commit -m "feat(spec-drift-detection): add CODE_DRIFT gate to plan SKILL.md

Spec: .context-index/specs/features/spec-drift-detection/skill-gate-integration.spec.md
Plan-task: 4"
```

---

### Task 5: Add drift integration to validate and hygiene SKILL.md [specialist: none]

**Charter capability:** Validate Integration, Hygiene Integration
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `skills/validate/SKILL.md`
- Modify: `skills/hygiene/SKILL.md`
- Create: `tests/skills/validate-drift-warn.test.mjs`
- Create: `tests/skills/hygiene-drift-pass.test.mjs`

**Tests:** `tests/skills/validate-drift-warn.test.mjs`, `tests/skills/hygiene-drift-pass.test.mjs`

- [x] **Write failing tests**

```javascript
// tests/skills/validate-drift-warn.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

describe('validate SKILL.md drift warning', () => {
  it('contains drift_detected warning instruction', () => {
    const content = readFileSync('skills/validate/SKILL.md', 'utf-8');
    assert.ok(content.includes('drift_detected'), 'Should reference drift_detected');
  });

  it('drift check is non-blocking (warns, does not fail)', () => {
    const content = readFileSync('skills/validate/SKILL.md', 'utf-8');
    assert.ok(content.includes('non-blocking') || content.includes('WARN'),
      'Should indicate drift check is non-blocking');
  });

  it('contains verifyManifest fallback', () => {
    const content = readFileSync('skills/validate/SKILL.md', 'utf-8');
    assert.ok(content.includes('verifyManifest'), 'Should reference verifyManifest fallback');
  });

  it('emits explicit warning on unreadable frontmatter', () => {
    const content = readFileSync('skills/validate/SKILL.md', 'utf-8');
    assert.ok(content.includes('frontmatter unreadable') || content.includes('CODE_DRIFT_READ_ERROR'),
      'Should handle unreadable frontmatter explicitly');
  });
});

// tests/skills/hygiene-drift-pass.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

describe('hygiene SKILL.md Code Drift pass', () => {
  it('contains Code Drift audit pass', () => {
    const content = readFileSync('skills/hygiene/SKILL.md', 'utf-8');
    assert.ok(content.includes('Code Drift') || content.includes('drift_detected'),
      'Should have a Code Drift audit pass');
  });

  it('scans specs for drift_detected: true', () => {
    const content = readFileSync('skills/hygiene/SKILL.md', 'utf-8');
    assert.ok(content.includes('drift_detected'),
      'Should scan for drift_detected field');
  });
});
```

- [x] **Verify tests fail** — `node --test tests/skills/validate-drift-warn.test.mjs tests/skills/hygiene-drift-pass.test.mjs`

- [x] **Implement**

**Validate SKILL.md:** Add a drift warning step (non-blocking) to the validation checks:

```markdown
### Check N: Code-Side Drift Warning

Run inline Node.js:
```javascript
const { hasDrift } = await import('<ADEV_ROOT>/lib/spec-drift.mjs');
try {
  const drifted = await hasDrift(specPath);
  if (drifted) {
    // Read drift_source and drift_at from frontmatter
    // Emit: "⚠ WARN: drift_detected flag set. Source file <drift_source>
    // was modified at <drift_at>. Verify that spec still reflects
    // implementation behavior."
  }
} catch {
  // Emit: "⚠ WARN: drift check skipped — frontmatter unreadable"
}
```

Also run `verifyManifest()` as fallback for non-Claude-Code hosts. If SHA mismatches, emit the same warning.

This check is **non-blocking** — validation continues regardless of result.
```

**Hygiene SKILL.md:** Add a Code Drift audit pass:

```markdown
### Pass N: Code Drift

Scan all specs matching `.context-index/specs/**/*.md` (excluding charter.md, *.review.md, *.plan.md).
For each spec, check if `drift_detected: true` exists in YAML frontmatter.

Report:
- PASS if no drifted specs found
- WARN with list of drifted specs (path, drift_source, drift_at) if any found
```

- [x] **Verify tests pass** — `node --test tests/skills/validate-drift-warn.test.mjs tests/skills/hygiene-drift-pass.test.mjs`

- [x] **Commit**

```bash
git add skills/validate/SKILL.md skills/hygiene/SKILL.md tests/skills/validate-drift-warn.test.mjs tests/skills/hygiene-drift-pass.test.mjs
git commit -m "feat(spec-drift-detection): add drift integration to validate and hygiene SKILL.md

Spec: .context-index/specs/features/spec-drift-detection/skill-gate-integration.spec.md
Plan-task: 5"
```

---

## Task Summary

| # | Task | Files | Strategy | Depends On |
|---|------|-------|----------|------------|
| 1 | Create lib/spec-drift.mjs | 2 create | unit | — |
| 2 | Extend sync-trigger.sh | 1 modify, 1 create | unit | Task 1 |
| 3 | Add clearDrift to implement SKILL.md | 1 modify, 1 create | unit | Task 1 |
| 4 | Add CODE_DRIFT gate to plan SKILL.md | 1 modify, 1 create | unit | Task 1 |
| 5 | Add drift to validate + hygiene SKILL.md | 2 modify, 2 create | unit | Task 1 |

## Quality Gates

After all tasks are complete, run the full quality gate suite:

- [x] Tests pass: `npm test`
- [x] All acceptance criteria from all 3 specs satisfied
- [x] No constitutional violations introduced
