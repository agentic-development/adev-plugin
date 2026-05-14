<!-- DO NOT EDIT statuses inline — see lifecycle log content-installation.jsonl -->
# Implementation Plan: Content Installation

> **Methodology:** adev
> **Charter:** .context-index/specs/features/extensions/charter.md
> **Spec:** .context-index/specs/features/extensions/content-installation.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-11)
> **Platform:** Node.js, JavaScript ESM, node:test, npm

**Goal:** Implement content merge operations for extensions: domain profile installation, governance config merging with schema validation, sample installation with path containment, and skill conflict detection.

**Architecture:** New `lib/extensions/content-install.mjs` handles all content-type installations. Domain profiles are copied directly to `.context-index/domains/<name>/`. Governance files are merged using ADR-0003 semantics (project-wins, merge-by-id). Samples use path canonicalization and containment checks. Reuses existing `BUNDLED_DOMAIN_NAMES` from `lib/domains/constants.mjs` and `parseYaml` from `lib/profiles/yaml.mjs`.

---

## File Structure

**Create:**
- `lib/extensions/content-install.mjs` — Domain profile, governance, sample, and skill content installers
- `tests/lib/extensions/content-install.test.mjs` — Content installation tests

**Modify:**
- (none — references existing modules but does not change them)

**Reference (read, do not modify):**
- `lib/domains/constants.mjs` — `BUNDLED_DOMAIN_NAMES`, `DOMAIN_NAME_PATTERN`
- `lib/profiles/yaml.mjs` — `parseYaml()` for governance file parsing
- `lib/governance/review-config.mjs` — Pattern for merge-by-id semantics
- `.context-index/adrs/0003-configurable-review-registry.md` — Merge semantics definition

## Context Packets

### Task 1 Context
- Spec: `content-installation.spec.md` (behaviors 1–4; error cases BUNDLED_COLLISION, INVALID_DOMAIN_NAME)
- Charter: `charter.md` (capabilities: Domain Profile Installation, Conflict Detection)
- Reference: `lib/domains/constants.mjs` (BUNDLED_DOMAIN_NAMES, DOMAIN_NAME_PATTERN)

### Task 2 Context
- Spec: `content-installation.spec.md` (behaviors 5–7; error cases GOVERNANCE_SCHEMA)
- Charter: `charter.md` (capabilities: Governance Config Merge)
- ADR: `.context-index/adrs/0003-configurable-review-registry.md` (merge semantics)
- Reference: `lib/profiles/yaml.mjs` (parseYaml), `lib/governance/review-config.mjs` (merge pattern)

### Task 3 Context
- Spec: `content-installation.spec.md` (behavior 8; error cases PATH_TRAVERSAL)
- Charter: `charter.md` (capabilities: Sample Installation)

### Task 4 Context
- Spec: `content-installation.spec.md` (behaviors 9–10; error cases SKILL_COLLISION)
- Charter: `charter.md` (capabilities: Conflict Detection)

## Parallelization

- Group A (independent): Task 1 (domain profiles)
- Group B (independent): Task 2 (governance merge)
- Group C (independent): Task 3 (samples)
- Group D (independent): Task 4 (skill conflict detection)

Tasks are sequential — they all contribute to the same `content-install.mjs` file. Task 1 creates the file, Tasks 2–4 add exports to it.

**Install report shape:** All content installers return a partial report: `{ filesWritten: string[], mergesApplied: string[], warnings: string[] }`. The orchestrator (`install.mjs`) merges partial reports into the final `InstallReport`.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Domain profile installer | medium | unit | — | 1 create, 1 create (test) |
| 2 | Governance entry validation and merge | large | unit | — | same file as Task 1, same test file |
| 3 | Sample installer with path containment | small | unit | — | same file, same test file |
| 4 | Skill conflict detection | small | unit | — | same file, same test file |

Note: All tasks contribute to the same `lib/extensions/content-install.mjs` and test file, but they implement independent exported functions.

---

### Task 1: Domain profile installer [specialist: none]

**Charter capability:** Domain Profile Installation
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/extensions/content-install.mjs`
- Test: `tests/lib/extensions/content-install.test.mjs`

**Tests:** `tests/lib/extensions/content-install.test.mjs`

- [ ] **Write failing test**

```javascript
import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { installDomainProfile } from '../../../lib/extensions/content-install.mjs';
import { createTempDir, cleanupTempDir } from '../../helpers.mjs';

describe('extensions/content-install — domain profiles', () => {
  let projectRoot, extDir;
  beforeEach(() => {
    projectRoot = createTempDir();
    mkdirSync(join(projectRoot, '.context-index'), { recursive: true });
    extDir = createTempDir();
  });
  afterEach(() => { cleanupTempDir(projectRoot); cleanupTempDir(extDir); });

  it('installs domain profile with domain.yaml', () => {
    writeFileSync(join(extDir, 'reviewers.yaml'), 'reviewers: []\n');
    const report = installDomainProfile(projectRoot, extDir, { name: 'my-domain', extends: 'software' });
    const domainYaml = readFileSync(join(projectRoot, '.context-index/domains/my-domain/domain.yaml'), 'utf8');
    assert.ok(domainYaml.includes('extends: software'));
    assert.ok(report.filesWritten.length > 0);
  });

  it('rejects bundled domain name', () => {
    assert.throws(
      () => installDomainProfile(projectRoot, extDir, { name: 'software', extends: 'software' }),
      (err) => err.code === 'BUNDLED_COLLISION'
    );
  });

  it('rejects non-kebab-case name', () => {
    assert.throws(
      () => installDomainProfile(projectRoot, extDir, { name: 'MyDomain', extends: 'software' }),
      (err) => err.code === 'INVALID_DOMAIN_NAME'
    );
  });

  it('overwrites on re-install (idempotent)', () => {
    writeFileSync(join(extDir, 'reviewers.yaml'), 'reviewers: []\n');
    installDomainProfile(projectRoot, extDir, { name: 'my-domain', extends: 'software' });
    installDomainProfile(projectRoot, extDir, { name: 'my-domain', extends: 'software' });
    assert.ok(existsSync(join(projectRoot, '.context-index/domains/my-domain/domain.yaml')));
  });
});
```

- [ ] **Verify test fails** → `node --test tests/lib/extensions/content-install.test.mjs` → FAIL
- [ ] **Implement** `installDomainProfile(projectRoot, extSourceDir, { name, extends: parent })`:
  - Validate name against `BUNDLED_DOMAIN_NAMES`, `DOMAIN_NAME_PATTERN`
  - Copy all recognized domain profile files from extSourceDir to `.context-index/domains/<name>/`
  - Generate `domain.yaml` with `extends: <parent>`
  - Return `{ filesWritten: [...] }`
- [ ] **Verify test passes** → PASS
- [ ] **Commit**

```bash
git add lib/extensions/content-install.mjs tests/lib/extensions/content-install.test.mjs
git commit -m "feat(extensions): add domain profile installer with bundled name guard

Spec: .context-index/specs/features/extensions/content-installation.spec.md
Plan-task: 1"
```

---

### Task 2: Governance entry validation and merge [specialist: none]

**Charter capability:** Governance Config Merge
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/extensions/content-install.mjs`
- Modify: `tests/lib/extensions/content-install.test.mjs`

**Tests:** `tests/lib/extensions/content-install.test.mjs`

- [ ] **Write failing test**

```javascript
describe('extensions/content-install — governance merge', () => {
  it('validates governance entry schema', () => {
    assert.throws(
      () => validateGovernanceEntry({ /* missing id */ dispatch: 'always' }),
      (err) => err.code === 'GOVERNANCE_SCHEMA'
    );
  });

  it('rejects id exceeding 128 chars', () => {
    assert.throws(
      () => validateGovernanceEntry({ id: 'a'.repeat(129) }),
      (err) => err.code === 'GOVERNANCE_SCHEMA'
    );
  });

  it('rejects nested objects in entry values', () => {
    assert.throws(
      () => validateGovernanceEntry({ id: 'test', config: { nested: { deep: true } } }),
      (err) => err.code === 'GOVERNANCE_SCHEMA'
    );
  });

  it('merges new entries into existing governance file', () => {
    writeFileSync(join(projectRoot, '.context-index/governance/review.yaml'),
      'reviewers:\n  - id: existing\n    dispatch: always\n');
    mergeGovernanceEntries(projectRoot, 'review.yaml', [{ id: 'new-one', dispatch: 'triggered' }]);
    const content = readFileSync(join(projectRoot, '.context-index/governance/review.yaml'), 'utf8');
    assert.ok(content.includes('existing'));
    assert.ok(content.includes('new-one'));
  });

  it('preserves project values on id collision (project wins)', () => {
    writeFileSync(join(projectRoot, '.context-index/governance/review.yaml'),
      'reviewers:\n  - id: shared\n    dispatch: always\n');
    mergeGovernanceEntries(projectRoot, 'review.yaml', [{ id: 'shared', dispatch: 'triggered', extra: 'new' }]);
    const content = readFileSync(join(projectRoot, '.context-index/governance/review.yaml'), 'utf8');
    assert.ok(content.includes('dispatch: always')); // project wins
  });

  it('auto-creates governance file when missing', () => {
    mergeGovernanceEntries(projectRoot, 'review.yaml', [{ id: 'first', dispatch: 'always' }]);
    assert.ok(existsSync(join(projectRoot, '.context-index/governance/review.yaml')));
  });
});
```

- [ ] **Verify test fails** → FAIL
- [ ] **Implement**:
  - Export `validateGovernanceEntry(entry)` — validate: `id` non-empty max 128, values are strings/numbers/booleans/string arrays, no nested objects
  - Export `mergeGovernanceEntries(projectRoot, targetFile, entries)` — read existing file (or create), parse YAML, merge by id (project wins), write back
- [ ] **Verify test passes** → PASS
- [ ] **Commit**

```bash
git add lib/extensions/content-install.mjs tests/lib/extensions/content-install.test.mjs
git commit -m "feat(extensions): add governance entry validation and merge engine

Spec: .context-index/specs/features/extensions/content-installation.spec.md
Plan-task: 2"
```

---

### Task 3: Sample installer with path containment [specialist: none]

**Charter capability:** Sample Installation
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/extensions/content-install.mjs`
- Modify: `tests/lib/extensions/content-install.test.mjs`

**Tests:** `tests/lib/extensions/content-install.test.mjs`

- [ ] **Write failing test**

```javascript
describe('extensions/content-install — samples', () => {
  it('copies sample file to .context-index/samples/', () => {
    writeFileSync(join(extDir, 'my-sample.md'), '# Sample');
    const report = installSamples(projectRoot, extDir, ['my-sample.md']);
    assert.ok(existsSync(join(projectRoot, '.context-index/samples/my-sample.md')));
  });

  it('rejects source-side path traversal', () => {
    writeFileSync(join(extDir, 'legit.md'), 'content');
    assert.throws(
      () => installSamples(projectRoot, extDir, ['../../etc/passwd']),
      (err) => err.code === 'PATH_TRAVERSAL'
    );
  });

  it('rejects dest-side path traversal via crafted filename', () => {
    // Create a file that would escape samples/ when joined as dest
    const maliciousName = '../domains/evil.yaml';
    writeFileSync(join(extDir, 'innocent.md'), 'content');
    assert.throws(
      () => installSamples(projectRoot, extDir, [{ src: 'innocent.md', dest: maliciousName }]),
      (err) => err.code === 'PATH_TRAVERSAL'
    );
  });

  it('warns on overwrite of existing sample', () => {
    mkdirSync(join(projectRoot, '.context-index/samples'), { recursive: true });
    writeFileSync(join(projectRoot, '.context-index/samples/existing.md'), 'old');
    writeFileSync(join(extDir, 'existing.md'), 'new');
    const report = installSamples(projectRoot, extDir, ['existing.md']);
    assert.ok(report.warnings.some(w => w.includes('existing.md')));
  });
});
```

- [ ] **Verify test fails** → FAIL
- [ ] **Implement** `installSamples(projectRoot, extSourceDir, samplePaths)`:
  - For each path: canonicalize source via `fs.realpathSync`, canonicalize dest via `path.resolve`
  - Assert source within extSourceDir, dest within `.context-index/samples/`
  - Throw `PATH_TRAVERSAL` on escape
  - Copy file, log overwrite warning if existing
- [ ] **Verify test passes** → PASS
- [ ] **Commit**

```bash
git add lib/extensions/content-install.mjs tests/lib/extensions/content-install.test.mjs
git commit -m "feat(extensions): add sample installer with path containment

Spec: .context-index/specs/features/extensions/content-installation.spec.md
Plan-task: 3"
```

---

### Task 4: Skill conflict detection [specialist: none]

**Charter capability:** Conflict Detection
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/extensions/content-install.mjs`
- Modify: `tests/lib/extensions/content-install.test.mjs`

**Tests:** `tests/lib/extensions/content-install.test.mjs`

- [ ] **Write failing test**

```javascript
describe('extensions/content-install — skill conflict', () => {
  it('passes when no collision with bundled skills', () => {
    const result = checkSkillConflicts(['my-custom-skill']);
    assert.equal(result.conflicts.length, 0);
  });

  it('blocks when skill name matches a bundled skill', () => {
    assert.throws(
      () => checkSkillConflicts(['brainstorm']),
      (err) => err.code === 'SKILL_COLLISION'
    );
  });

  it('lists all conflicting names', () => {
    try {
      checkSkillConflicts(['brainstorm', 'plan', 'my-skill']);
    } catch (err) {
      assert.equal(err.code, 'SKILL_COLLISION');
      assert.ok(err.conflicts.includes('brainstorm'));
      assert.ok(err.conflicts.includes('plan'));
      assert.equal(err.conflicts.length, 2);
    }
  });
});
```

- [ ] **Verify test fails** → FAIL
- [ ] **Implement** `checkSkillConflicts(skillNames)`:
  - Read bundled skill names from the plugin's `skills/` directory listing
  - Compare each extension skill name against bundled set
  - If any collision → throw with `code: 'SKILL_COLLISION'` and `conflicts` array
- [ ] **Verify test passes** → PASS
- [ ] **Commit**

```bash
git add lib/extensions/content-install.mjs tests/lib/extensions/content-install.test.mjs
git commit -m "feat(extensions): add skill conflict detection

Spec: .context-index/specs/features/extensions/content-installation.spec.md
Plan-task: 4"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite.

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied
